import {ContentError} from './content-store.mjs';

const sections = ['overview', 'analytics', 'blog', 'products', 'banners', 'clients', 'orders'];
const instructions = 'Ты помощник админки SIZEY. Отвечай по-русски, кратко и по делу. Используй переданные данные и проверенные шаги. Если сведений мало, задай уточняющий вопрос. Помогай писать тексты и объясняй действия. Запись выполняет администратор. Верни JSON: answer (текст), section (overview, analytics, blog, products, banners, clients, orders или null).';
const titleInstructions = 'Дай один короткий заголовок по-русски. Бери свойства из фактов. JSON: answer — заголовок, section — null.';
export function shortTitleSubject(question) {
 if (/[;,]| и | также | потом /iu.test(question)) return null;
 return question.match(/^(?:напиши|придумай|предложи|составь) (?:короткий |краткий )?заголовок(?: для | к |: )([^\n]{1,140})$/iu)?.[1] ?? null;
}
const guides = [
 {section:'products', topic:/категори|размер/, action:/^(?:как|где) (?:добавить|создать|настроить|изменить) (?:категори[юи]|размер(?:ы)?)(?: товара)?$/,
  answer:'В разделе «Товары» нажмите «Категории и размеры», выберите нужный список и добавьте значение. Затем откройте карточку товара, выберите его и сохраните карточку.'},
 {section:'products', topic:/публик|витрин|скрыть/, action:/^(?:как|где) (?:опубликовать|показать) товар(?: на витрине)?$/,
  answer:'В разделе «Товары» откройте карточку, включите публикацию внизу формы и сохраните. Включённый переключатель показывает статус «Опубликован на витрине».'},
 {section:'products', topic:/товар|каталог|карточк/, action:/^(?:как|где) (?:добавить|создать) (?:новый )?товар(?: в каталог)?$/,
  answer:'Откройте «Товары» → «Добавить товар». Заполните карточку, загрузите фото и выберите категории и размеры. Включите публикацию, если товар должен появиться на витрине, затем сохраните.'},
 {section:'banners', topic:/баннер/, action:/^(?:как|где) (?:добавить|создать) (?:новый )?баннер(?: на главную)?$/,
  answer:'Откройте «Баннеры» → «Добавить баннер». Укажите название, загрузите изображение, выберите категорию и позицию. Включите публикацию и сохраните, чтобы баннер появился на главной.'},
 {section:'blog', topic:/публик|черновик|оценк/, action:/^(?:как|где) опубликовать (?:черновик|статью)(?: в блоге)?$/,
  answer:'В разделе «Блог и новости» откройте статью во вкладке «Черновики». Проверьте факты и источники. Кнопка «Опубликовать» доступна при оценке от 85 из 100.'},
 {section:'blog', topic:/блог|стать|черновик/, action:/^(?:как|где) (?:создать|добавить|написать) (?:новую )?(?:статью|черновик)(?: в блоге)?$/,
  answer:'Откройте «Блог и новости» → «Создать статью». Укажите тему и запустите создание черновика. Он появится во вкладке «Черновики», где его можно проверить, отредактировать и опубликовать.'},
 {section:'analytics', topic:/аналитик|посещен|трафик|конверс|сесси/, action:/^(?:как|где) посмотреть (?:аналитику|посещения|трафик|конверсию)(?: сайта)?$/,
  answer:'Откройте «Аналитика» и выберите 7, 30 или 90 дней либо свой период. Там видны посещения и действия покупателей. Продажи бонусной системы смотрите в карточке клиента или в бонусном кабинете.'},
 {section:'clients', topic:/карт|подключ|лояльност/, action:/^(?:как|где) (?:подключить|оформить|добавить) бонусную карту(?: клиенту)?$/,
  answer:'В разделе «Клиенты» найдите зарегистрированного покупателя и откройте его карточку. Если карта ещё не подключена, нажмите «Подключить бонусную карту».'},
 {section:'clients', topic:/начисл|бонус/, action:/^(?:как|где) начислить бонусы(?: клиенту)?$/,
  answer:'В «Клиенты» откройте карточку покупателя. В блоке «Бонусы, продажи и возвраты» выберите «Начислить бонусы», укажите количество и подтвердите начисление.'},
 {section:'clients', topic:/спис|бонус/, action:/^(?:как|где) списать бонусы(?: у клиента| клиенту)?$/,
  answer:'В карточке клиента откройте «Бонусы, продажи и возвраты», выберите «Списать бонусы», укажите количество и подтвердите списание.'},
 {section:'clients', topic:/продаж/, action:/^(?:как|где) (?:создать|провести|оформить) продажу(?: клиенту)?$/,
  answer:'В карточке клиента откройте «Бонусы, продажи и возвраты». Выберите «Создать продажу», введите сумму покупки и число списываемых бонусов, затем подтвердите.'},
 {section:'clients', topic:/возврат/, action:/^(?:как|где) (?:сделать|оформить|провести) возврат(?: по операции| клиенту)?$/,
  answer:'В карточке клиента откройте «Бонусы, продажи и возвраты». Выберите «Возврат по операции», укажите нужную операцию из истории и подтвердите возврат.'},
 {section:'clients', topic:/отмен.*продаж/, action:/^(?:как|где) отменить продажу$/,
  answer:'В карточке клиента откройте «Бонусы, продажи и возвраты». Выберите «Отменить продажу», найдите операцию в истории и подтвердите отмену.'},
 {section:'orders', topic:/заказ|корзин|оформлени/, action:/^почему (?:нет|не видно|не отображаются) (?:новые )?заказ(?:ы|ов)(?: в админке)?$/,
  answer:'В SIZEY Hub пока не подключено оформление покупок, поэтому демонстрационная корзина не создаёт заказов и не проводит оплату. Продажи бонусной системы доступны в действующем бонусном кабинете.'}
];

const knowledgeTopics = {
 products:/товар|каталог|карточк|размер|категори/,
 banners:/баннер/,
 blog:/блог|стать|черновик/,
 analytics:/аналитик|посещен|трафик|конверс|сесси/,
 clients:/клиент|лояльност|бонус|продаж|возврат/,
 orders:/заказ|корзин/
};

function relevantGuides(query, section) {
 const domains = Object.keys(knowledgeTopics).filter(domain => knowledgeTopics[domain].test(query));
 return guides.filter(guide => (domains.length ? domains.includes(guide.section) : guide.section === section) && guide.topic.test(query))
  .slice(0, 3).map(guide => guide.answer);
}

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

function quickReply(question) {
 const intent = question.toLocaleLowerCase('ru').replace(/[^а-яёa-z0-9 ]/g, '').replace(/ +/g, ' ');
 if (/^(привет|здравствуйте|здравствуй|йоу|хай|hello|hi)$/.test(intent)) {
  return {answer: 'Привет! ' + capabilities, section: null};
 }
 if (/^(?:(?:а|и) )?(?:ты )?(?:что (?:ты )?умеешь|как (?:ты )?можешь помочь|чем (?:ты )?можешь помочь)$/.test(intent)) {
  return {answer: capabilities, section: null};
 }
 return null;
}

function generalContext(store, blog, analytics, section, query, matches) {
 const {recent, ...summary} = store.summary();
 const report = section === 'analytics' || /аналитик|посещен|трафик|конверс|сесси/.test(query) ? analytics?.report(7) : null;
 return {
  section,
  overview: summary,
  products: matches.length ? matches.slice(0, 4).map(({product: {id, name, price, categories, sizes, published}}) =>
   ({id, name: name.slice(0, 100), price, categories: categories.slice(0, 3), sizes: sizes.slice(0, 6), published})) : undefined,
  banners: section === 'banners' || /баннер/.test(query) ? store.list('banners').slice(0, 4).map(({title, published}) => ({title: title.slice(0, 100), published})) : undefined,
  articles: section === 'blog' || /стать|блог/.test(query) ? (blog?.list() || []).slice(0, 4).map(({title, published}) => ({title: title.slice(0, 100), published})) : undefined,
  analytics: report ? {from: report.from, to: report.to, startedAt: report.startedAt, metrics: report.metrics} : undefined
 };
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
 const quick = quickReply(question);
 if (quick) return quick;
 const query = question.toLocaleLowerCase('ru');
 const products = store.list('products');
 const catalog = catalogReply(normalize(question), products);
 if (catalog) return catalog;
 const learned = store.db?.prepare('SELECT answer,section FROM hub_assistant_answers WHERE actor=? AND question_key=?')
  .get(String(actor), questionKey(question));
 if (learned) return {...learned, source: 'learned'};
 const normalized = normalize(question).replace(/^(?:подскажи(?:те)? )?(?:пожалуйста )?/, '')
  .replace(/^(как|где) мне /, '$1 ').replace(/ пожалуйста$/, '');
 const guide = guides.find(item => item.action.test(normalized));
 if (guide) return {answer: guide.answer, section: guide.section, source: 'guide'};
 const examples = learnedExamples(store.db, actor, question);
 const titleSubject = shortTitleSubject(question);
 const help = titleSubject ? [] : relevantGuides(query, section);
 const terms = (titleSubject?.toLocaleLowerCase('ru') ?? query).match(/[\p{L}\p{N}]{3,}/gu) || [];
 const matches = products.map(product => {
  const name = product.name.toLocaleLowerCase('ru');
  return {product, score: terms.filter(term => name.includes(term)).length};
 }).filter(item => item.score > 0).sort((a, b) => b.score - a.score);
 const data = titleSubject ?
  matches.slice(0, 2).map(({product}) =>
   [product.name.slice(0, 100), ...product.categories.slice(0, 2)].join(', ')).join(' / ') :
  JSON.stringify(generalContext(store, blog, analytics, section, query, matches));
 const previous = history.slice(0, -1);
 while (previous.length && quickReply(previous.at(-2).content.trim())) previous.splice(-2);
 return [
  {role: 'system', content: (titleSubject ? titleInstructions : instructions) + (data ? '\nДанные SIZEY: ' + data : '') +
   (help.length ? '\nПроверенные шаги в админке: ' + help.join(' ') : '') +
   (examples.length ? '\nОдобренные примеры ответов. Используй только подходящие как справку, а текущие данные магазина имеют приоритет: ' + JSON.stringify(examples) : '')},
  ...previous.slice(-2).map(({role, content}) => ({role, content: content.trim().slice(0, 360)})),
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
