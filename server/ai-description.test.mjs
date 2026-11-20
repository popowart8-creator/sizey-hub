import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createDescriptionAI,descriptionFacts} from './ai-description.mjs';
const model='qwen2.5:1.5b';
function fixture(){const calls=[];let installed=true;const fetchImpl=async(url,opts={})=>{calls.push({url:String(url),...opts});if(String(url).endsWith('/api/tags'))return Response.json({models:installed?[{name:model}]:[]});return Response.json({message:{content:'Лаконичное пальто с поясом. Подходит для создания спокойных повседневных образов.'}})};return{ai:createDescriptionAI({fetchImpl,model}),calls,setInstalled(v){installed=v}}}
test('local model status detects missing model',async()=>{const x=fixture();assert.equal((await x.ai.status()).ready,true);x.setInstalled(false);assert.equal((await x.ai.status()).ready,false)});
test('generation uses local Ollama only and never an external API',async()=>{const x=fixture();const result=await x.ai.generate({name:'Пальто',categories:['Пальто'],facts:'С поясом',mode:'create'},'staff');assert.equal(result.free,true);assert.ok(x.calls.every(c=>c.url.startsWith('http://127.0.0.1:11434/')));const req=x.calls.find(c=>c.url.endsWith('/api/chat'));const body=JSON.parse(req.body);assert.equal(body.model,model);assert.equal(body.stream,false);assert.match(body.messages[0].content,/Не придумывай/)});
test('rejects extra product fields and missing improve text',()=>{assert.throws(()=>descriptionFacts({name:'Пальто',phone:'79999999999'}),e=>e.status===400);assert.throws(()=>descriptionFacts({name:'Пальто',mode:'improve'}),e=>e.status===400)});
test('unreachable Ollama reports service unavailable',async()=>{const ai=createDescriptionAI({fetchImpl:async()=>{throw Error('offline')}});assert.equal((await ai.status()).ready,false);await assert.rejects(ai.generate({name:'Пальто'},'staff'),e=>e.status===503)});

test('SEO suggestions use local model and validate structured response',async()=>{
 const calls=[];
 const ai=createDescriptionAI({fetchImpl:async(url,opts={})=>{
  calls.push(String(url));
  return Response.json({message:{content:JSON.stringify({title:'Чёрное пальто с поясом — SIZEY',description:'Чёрное пальто с поясом для повседневных образов.',tags:['пальто','чёрное пальто','пальто с поясом']})}});
 }});
 const result=await ai.seo({name:'Пальто',categories:['Пальто'],facts:'Чёрное, с поясом'},'admin');
 assert.equal(result.tags.length,3);
 assert.match(result.title,/SIZEY/);
 assert.ok(calls.every(url=>url.startsWith('http://127.0.0.1:11434/')));
});
test('SEO rejects invalid model output',async()=>{
 const ai=createDescriptionAI({fetchImpl:async()=>Response.json({message:{content:'not json'}})});
 await assert.rejects(ai.seo({name:'Пальто'},'admin'),e=>e.status===502);
});

test('assistant uses Ollama and only returns allowlisted navigation', async () => {
 const messages = [{role: 'user', content: 'Где аналитика?'}];
 const ai = createDescriptionAI({fetchImpl: async (url, options) => {
  assert.equal(url.pathname, '/api/chat');
  const request = JSON.parse(options.body);
  assert.deepEqual(request.messages, messages);
  assert.equal(request.keep_alive, '5m');
  assert.deepEqual(request.format.required, ['answer','section']);
  assert.ok(request.options.num_ctx <= 3072);
  assert.ok(request.options.num_predict <= 220);
  return Response.json({message: {content: JSON.stringify({answer: 'Откройте аналитику.', section: 'analytics'})}});
 }});
 assert.deepEqual(await ai.assistant(messages, 'admin'), {answer: 'Откройте аналитику.', section: 'analytics'});

 const invalidSection = createDescriptionAI({fetchImpl: async () =>
  Response.json({message: {content: JSON.stringify({answer: 'Ответ', section: '/admin/secret'})}})});
 assert.deepEqual(await invalidSection.assistant(messages, 'admin'), {answer: 'Ответ', section: null});
});

test('assistant distinguishes a slow Ollama response from a connection error', async () => {
 const ai = createDescriptionAI({fetchImpl: async () => { throw new DOMException('Timeout', 'TimeoutError'); }});
 await assert.rejects(ai.assistant([], 'admin'), error => error.status === 504);
});

test('catalog facts use exact matches and skip generation', async () => {
 const {prepareAssistantReply} = await import('./admin-assistant.mjs');
 const product = {id: 42, name: 'Пальто «Север»', price: 5900, categories: ['Пальто'], sizes: ['S', 'M'], published: true};
 const ask = (content, products = [product]) => prepareAssistantReply({
  section: 'products', history: [{role: 'user', content}]
 }, {store: {list: () => products, summary: () => ({})}});
 assert.match(ask('Сколько стоит пальто «Север»?').answer, /5\s900/);
 assert.match(ask('Размеры товара №42').answer, /S, M/);
 assert.match(ask('Сколько товаров в каталоге?').answer, /На витрине: 1/);
 assert.ok(Array.isArray(ask('Сколько стоит пальто?')));
 assert.ok(Array.isArray(ask('Цена пальто Север', [product, {...product, id: 43}])));
});

test('assistant bounds single-title generation while preserving the budget for longer tasks', async () => {
 const budgets = [];
 const ai = createDescriptionAI({fetchImpl: async (_url, options) => {
  budgets.push(JSON.parse(options.body).options.num_predict);
  return Response.json({message: {content: JSON.stringify({answer: 'Пальто SIZEY', section: null})}});
 }});
 for (const content of ['Напиши короткий заголовок для пальто SIZEY', 'Напиши заголовок для пальто и описание']) {
  await ai.assistant([{role: 'user', content}], 'admin');
 }
 assert.deepEqual(budgets, [96, 220]);
});

test('assistant corrections survive reopening SQLite and stay private to their author', async () => {
 const {mkdtempSync, rmSync} = await import('node:fs');
 const {tmpdir} = await import('node:os');
 const {join} = await import('node:path');
 const {contentStore} = await import('./content-store.mjs');
 const {prepareAssistantReply, saveAssistantAnswer} = await import('./admin-assistant.mjs');
 const directory = mkdtempSync(join(tmpdir(), 'sizey-answers-'));
 const open = () => contentStore(join(directory, 'content.sqlite'), {seedProducts: [], seedBanners: []});
 let store = open();
 try {
  const question = 'Как подготовить сезонный баннер';
  saveAssistantAnswer(store.db, 'first', {question, answer: 'Откройте раздел баннеров.'}, 1);
  saveAssistantAnswer(store.db, 'first', {question, answer: 'Начните с фотографии.'}, 2);
  store.close();
  store = open();
  const ask = (actor, content) => prepareAssistantReply({
   section: 'overview', history: [{role: 'user', content}]
  }, {store, actor});
  assert.equal(ask('first', question + '?').answer, 'Начните с фотографии.');
  assert.match(ask('first', question + ' для витрины')[0].content, /Начните с фотографии/);
  assert.doesNotMatch(ask('second', question)[0].content, /Начните с фотографии/);
 } finally {
  store.close();
  rmSync(directory, {recursive: true, force: true});
 }
});

test('assistant exposes JSON answer text before Ollama finishes the response', async () => {
 const encoder = new TextEncoder();
 let feed;
 const body = new ReadableStream({start(controller) { feed = controller; }});
 const ai = createDescriptionAI({fetchImpl: async (_url, options) => {
  assert.equal(JSON.parse(options.body).stream, true);
  return new Response(body);
 }});
 const send = event => feed.enqueue(encoder.encode(JSON.stringify(event) + '\n'));
 let notify;
 const first = new Promise(resolve => { notify = resolve; });
 const progress = [];
 const result = ai.assistant([{role: 'user', content: 'Заголовок'}], 'admin', {
  onProgress(text) { progress.push(text); notify(text); }
 });
 send({message: {content: '{"answer":"Пальто \\u04'}});
 assert.equal(await first, 'Пальто ');
 send({message: {content: '10","section":"products"}'}, done: true});
 feed.close();
 assert.deepEqual(await result, {answer: 'Пальто А', section: 'products'});
 assert.deepEqual(progress, ['Пальто ', 'Пальто А']);
});

test('opening multiple chats preloads one Ollama runner without generating tokens', async () => {
 let time = 0;
 const calls = [];
 const ai = createDescriptionAI({now: () => time, fetchImpl: async (_url, options) => {
  calls.push(JSON.parse(options.body));
  return Response.json({done: true});
 }});
 await Promise.all([ai.warmAssistant(), ai.warmAssistant()]);
 await ai.warmAssistant();
 assert.equal(calls.length, 1);
 assert.deepEqual(calls[0].messages, []);
 assert.equal(calls[0].options.num_ctx, 3072);
 assert.equal(calls[0].keep_alive, '5m');
 time += 60000;
 await ai.warmAssistant();
 assert.equal(calls.length, 2);
});

test('single-title prompts omit unrelated page data and retain product facts', async () => {
 const {prepareAssistantReply} = await import('./admin-assistant.mjs');
 const store = {
  list: () => [{id:1,name:'Пальто SIZEY',categories:['Пальто'],sizes:['S','M'],price:5900}],
  summary: () => { throw new Error('Title generation does not need a store overview'); }
 };
 const messages = prepareAssistantReply({
  section:'analytics', history:[{role:'user',content:'Напиши короткий заголовок для пальто SIZEY'}]
 }, {store,analytics:{report:() => { throw new Error('Title generation does not need analytics'); }}});
 assert.match(messages[0].content, /Пальто SIZEY/);
 assert.doesNotMatch(messages[0].content, /5900|analytics|overview/);
 assert.ok(messages.reduce((length, message) => length + message.content.length, 0) < 240);
});

test('assistant knows the actual SIZEY admin workflows and supplies relevant steps on complex questions', async () => {
 const {prepareAssistantReply} = await import('./admin-assistant.mjs');
 const store = {list: () => [], summary: () => ({})};
 const ask = content => prepareAssistantReply({section:'overview',history:[{role:'user',content}]},{store});
 for (const [question, section, label] of [
  ['Как добавить товар?', 'products', 'Добавить товар'],
  ['Подскажи, как мне создать статью в блоге?', 'blog', 'Создать статью'],
  ['Где посмотреть конверсию сайта?', 'analytics', '7, 30 или 90'],
  ['Как оформить возврат?', 'clients', 'Возврат по операции'],
  ['Как подключить бонусную карту клиенту?', 'clients', 'Подключить бонусную карту'],
  ['Почему нет заказов в админке?', 'orders', 'демонстрационная корзина']
 ]) {
  const reply = ask(question);
  assert.equal(reply.section, section);
  assert.equal(reply.source, 'guide');
  assert.ok(reply.answer.includes(label));
 }
 const messages = ask('Можно ли оформить возврат по операции покупателя и где искать историю?');
 assert.match(messages[0].content, /Проверенные шаги.*Возврат по операции/);
 assert.doesNotMatch(messages[0].content, /Добавить товар/);
});

test('complex follow-ups recover the previous topic and request a grounded plan', async () => {
 const {prepareAssistantReply} = await import('./admin-assistant.mjs');
 const store = {list: () => [], summary: () => ({})};
 const messages = prepareAssistantReply({section:'overview',history:[
  {role:'user',content:'Как оформить возврат?'},
  {role:'assistant',content:'Выберите операцию из истории.'},
  {role:'user',content:'А если нужной операции нет?'}
 ]},{store});
 assert.match(messages[0].content, /Учти условия и порядок/);
 assert.match(messages[0].content, /Возврат по операции/);
 assert.match(messages[0].content, /один конкретный вопрос/);
 assert.equal(messages[1].content, 'Как оформить возврат?');
});
