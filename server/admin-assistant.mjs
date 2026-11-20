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

export function prepareAssistantReply(input, {store, blog, analytics}) {
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
  {role: 'system', content: instructions + '\nДанные SIZEY: ' + JSON.stringify(context)},
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
