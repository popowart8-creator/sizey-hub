import {ContentError} from './content-store.mjs';

const sections = ['overview', 'analytics', 'blog', 'products', 'banners', 'clients', 'orders'];
const instructions = 'Ты помощник админки SIZEY. Отвечай по-русски, кратко и по делу. Для фактов о магазине используй данные ниже. Помогай писать тексты и объясняй действия. Запись выполняет администратор. Верни JSON: answer (текст), section (overview, analytics, blog, products, banners, clients, orders или null).';
const capabilities = 'Помогу найти товары и разобраться в аналитике. Могу подготовить описание товара, SEO или черновик статьи и подсказать, где изменить баннер, посмотреть заказы или открыть настройки лояльности.';

const normalize = value => value.toLocaleLowerCase('ru').replace(/ё/g, 'е')
 .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const rubles = new Intl.NumberFormat('ru-RU', {style: 'currency', currency: 'RUB', maximumFractionDigits: 2, minimumFractionDigits: 0});

function catalogReply(question, products) {
 if (/^сколько (?:всего )?товаров (?:у нас |сейчас )?в каталоге$/.test(question)) {
  return {answer: `Товаров в каталоге: ${products.length}. На витрине: ${products.filter(p => p.published).length}.`, section: 'products'};
 }
 const price = question.match(/^(?:сколько стоит|какая цена у|цена) (.+)$/);
 const sizes = question.match(/^(?:какие размеры у|размеры) (.+)$/);
 const subject = price?.[1] ?? sizes?.[1];
 if (!subject) return null;
 const id = subject.match(/^(?:товар[а]? |id )?(\d+)$/)?.[1];
 const exact = products.filter(product => id ? String(product.id) === id : normalize(product.name) === subject);
 if (exact.length !== 1) return null;
 const product = exact[0];
 const details = price ? rubles.format(product.price) :
  product.sizeKnown !== false && product.sizes.length ? 'размеры в карточке: ' + product.sizes.join(', ') : 'размеры не указаны';
 return {answer: `${product.name} — ${details}.`, section: 'products'};
}

const questionKey = question => question.normalize('NFKC').toLocaleLowerCase('ru')
 .replace(/ё/g, 'е').replace(/\s+/g, ' ').trim().replace(/[?!.]+$/, '').trim();

export function saveAssistantAnswer(db, actor, input, now) {
 const {question, answer, section} = input;
 if (typeof question !== 'string' || question.length > 2000 || !questionKey(question) ||
     typeof answer !== 'string' || !answer.trim() || answer.length > 4000 ||
     section != null && !sections.includes(section)) {
  throw new ContentError(400, 'Укажите вопрос и исправленный ответ');
 }
 const key = questionKey(question);
 db.prepare(`INSERT INTO hub_assistant_answers(actor,question_key,question,answer,section,updated)
  VALUES(?,?,?,?,?,?) ON CONFLICT(actor,question_key) DO UPDATE SET
  question=excluded.question,answer=excluded.answer,section=excluded.section,updated=excluded.updated`)
  .run(String(actor), key, question.trim(), answer.trim(), section ?? null, now);
 return {answer: answer.trim(), section: section ?? null, source: 'learned'};
}

function learnedExamples(db, actor, question) {
 const words = value => new Set(questionKey(value).match(/[\p{L}\p{N}]{3,}/gu) || []);
 const query = words(question);
 if (!db || query.size < 3) return [];
 const entries = db.prepare(`SELECT question,answer FROM hub_assistant_answers WHERE actor=?
  ORDER BY updated DESC,question_key LIMIT 60`).all(String(actor));
 return entries.map(entry => {
  const terms = words(entry.question);
  const shared = [...query].filter(word => terms.has(word)).length;
  return {entry, score: shared >= 3 ? shared / (query.size + terms.size - shared) : 0};
 }).filter(item => item.score >= 0.5).sort((a, b) => b.score - a.score).slice(0, 2)
  .map(({entry}) => ({question: entry.question.slice(0, 200), answer: entry.answer.slice(0, 400)}));
}

export function prepareAssistantReply(input, {store, blog, analytics, actor}) {
 const {section, history} = input;
 if (!sections.includes(section) || !Array.isArray(history) || history.length < 1 || history.length > 7 ||
     history.length % 2 === 0 || history.some((turn, index) => !turn ||
       turn.role !== (index % 2 === 0 ? 'user' : 'assistant') ||
       typeof turn.content !== 'string' || !turn.content.trim() ||
       turn.content.length > (turn.role === 'user' ? 2000 : 4000))) {
  throw new ContentError(400, 'Проверьте сообщение для ИИ-помощника');
 }
 const question = history.at(-1).content.trim();
 const intent = question.toLocaleLowerCase('ru').replace(/[^а-яёa-z0-9 ]/g, '').replace(/ +/g, ' ');
 if (/^(привет|здравствуйте|здравствуй|йоу|хай|hello|hi)$/.test(intent)) {
  return {answer: 'Привет! ' + capabilities, section: null};
 }
 if (/^(?:(?:а|и) )?(?:ты )?(?:что (?:ты )?умеешь|как (?:ты )?можешь помочь|чем (?:ты )?можешь помочь)$/.test(intent)) {
  return {answer: capabilities, section: null};
 }
 const query = question.toLocaleLowerCase('ru');
 const products = store.list('products');
 const catalog = catalogReply(normalize(question), products);
 if (catalog) return catalog;
 const learned = store.db?.prepare('SELECT answer,section FROM hub_assistant_answers WHERE actor=? AND question_key=?')
  .get(String(actor), questionKey(question));
 if (learned) return {...learned, source: 'learned'};
 const examples = learnedExamples(store.db, actor, question);
 const terms = query.match(/[\p{L}\p{N}]{3,}/gu) || [];
 const matches = products.map(product => {
  const name = product.name.toLocaleLowerCase('ru');
  return {product, score: terms.filter(term => name.includes(term)).length};
 }).filter(item => item.score > 0).sort((a, b) => b.score - a.score);
 const {recent, ...overview} = store.summary();
 const report = section === 'analytics' || /аналитик|посещен|трафик|конверс|сесси/.test(query) ? analytics?.report(7) : null;
 const context = {
  section,
  overview,
  products: matches.slice(0, 4).map(({product: {id, name, price, categories, sizes, published}}) =>
   ({id, name: name.slice(0, 100), price, categories: categories.slice(0, 3), sizes: sizes.slice(0, 6), published})),
  banners: section === 'banners' || /баннер/.test(query) ? store.list('banners').slice(0, 4).map(({title, published}) => ({title: title.slice(0, 100), published})) : undefined,
  articles: section === 'blog' || /стать|блог/.test(query) ? (blog?.list() || []).slice(0, 4).map(({title, published}) => ({title: title.slice(0, 100), published})) : undefined,
  analytics: report ? {from: report.from, to: report.to, startedAt: report.startedAt, metrics: report.metrics} : null
 };
 return [
  {role: 'system', content: instructions + '\nДанные SIZEY: ' + JSON.stringify(context) +
   (examples.length ? '\nОдобренные примеры ответов. Используй только подходящие как справку, а текущие данные магазина имеют приоритет: ' + JSON.stringify(examples) : '')},
  ...history.slice(-3, -1).map(({role, content}) => ({role, content: content.trim().slice(0, 360)})),
  {role: 'user', content: question}
 ];
}

export function assistantAnswer(raw) {
 let result;
 try { result = JSON.parse(raw); } catch {
  throw new ContentError(502, 'ИИ вернул некорректный ответ. Повторите запрос.');
 }
 const answer = typeof result?.answer === 'string' ? result.answer.trim() : '';
 if (!answer || answer.length > 4000) throw new ContentError(502, 'ИИ не смог подготовить ответ');
 return {answer, section: sections.includes(result.section) ? result.section : null};
}
