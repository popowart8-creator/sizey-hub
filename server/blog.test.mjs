import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {blogStore} from './blog-store.mjs';
import {createBlogAI,scoreTopic} from './blog-ai.mjs';
import {analyticsStore} from './analytics.mjs';
import {createDailyBlogDraft,autoSlug} from './blog-auto.mjs';

const source=(host)=>({title:'Подробный независимый источник о моде',url:'https://'+host+'/style-guide'});
const fixture=(overrides={})=>({title:'Как выбрать пальто для осени',slug:'how-to-choose-coat',summary:'Практическое руководство по выбору пальто для повседневного гардероба SIZEY.',sections:['Выбирайте посадку исходя из того, какую одежду планируете надевать под пальто. Примеряйте образ целиком.','Сравнивайте модели по силуэту и сочетаниям с базовыми вещами, не полагаясь только на фотографии.'],sources:[source('example.com'),source('example.org')],productIds:[1],score:90,...overrides});
const room=()=>mkdtempSync(join(tmpdir(),'sizey-blog-'));
test('blog keeps drafts private and enforces score, independent sources and linked products',()=>{
 const dir=room(),store=blogStore(join(dir,'blog.sqlite'),{now:()=>123});
 try{
  assert.throws(()=>store.save(fixture({sources:[source('example.com'),source('example.com')]})),e=>e.status===400);
  const low=store.save(fixture({score:79}));
  assert.equal(store.publicList().length,0);
  assert.throws(()=>store.publish(low.id,true,[{id:1,published:true}]),e=>e.status===409);
  const high=store.save(fixture({slug:'coat-buying-guide',score:93}));
  assert.throws(()=>store.publish(high.id,true,[]),e=>e.status===409);
  store.publish(high.id,true,[{id:1,published:true}]);
  assert.equal(store.publicList().length,1);
  assert.equal(store.publicOne(high.slug).title,high.title);
  assert.equal(store.publicOne(low.slug),undefined);
  const edited=store.save(fixture({title:'Обновлённый гид по выбору пальто',sections:['## Как выбрать пальто','Свободный текст без ограничения длины. '.repeat(180)]}),high.id);
  assert.equal(edited.published,true);
  assert.equal(store.publicOne(high.slug).title,'Обновлённый гид по выбору пальто');
  assert.equal(edited.sections[1].length>2500,true);
  store.publish(high.id,false,[{id:1,published:true}]);
  assert.equal(store.publicList().length,0);
 }finally{store.close();rmSync(dir,{recursive:true,force:true})}
});
test('Qwen rejects weak research and does not mistake popularity for commercial evidence',async()=>{
 const products=[{id:1,name:'Пальто прямого кроя',cat:'Пальто',categories:['Пальто'],published:true}];
 assert.equal(scoreTopic('Новостная лента',products,[]).score,0);
 assert.equal(scoreTopic('Как выбрать пальто',products,[source('one.example'),source('two.example')]).score,85);
 const ai=createBlogAI({fetchImpl:async()=>{throw Error('Offline')}});
 const result=await ai.generate({topic:'Обзор последних новостей моды',products});
 assert.equal(result.rejected,true);assert.equal(result.score<85,true);
});
test('article analytics separately count readers, product clicks, attributed carts, and demo checkout',()=>{
 const dir=room(),store=analyticsStore(join(dir,'analytics.sqlite'),{now:()=>Date.parse('2026-11-20T12:00:00Z')});
 const visitor=randomUUID(),session=randomUUID(),slug='how-to-choose-coat';
 const event=(kind,rest={})=>({id:randomUUID(),visitor,session,kind,screen:'blog_article',device:'android',formFactor:'mobile',mode:'browser',articleSlug:slug,...rest});
 try{
  store.collect({events:[event('screen_view',{viewId:randomUUID()}),event('blog_article_open'),event('blog_product_click',{productId:1}),event('cart_add',{productId:1}),event('checkout_start')]});
  const report=store.report(7);const article=report.blogArticles.find(a=>a.slug===slug);
  assert.equal(article.opens,1);assert.equal(article.readers,1);assert.equal(article.productClicks,1);assert.equal(article.cartSessions,1);assert.equal(article.checkoutSessions,1);
  assert.throws(()=>store.collect({events:[event('blog_product_click',{articleSlug:'private.com/customer?phone=123',productId:1})]}),e=>e.status===400);
  assert.equal(report.metrics.cartAdds,1);
 }finally{store.close();rmSync(dir,{recursive:true,force:true})}
});

test('daily Qwen draft automation is idempotent, throttled and never auto-publishes',async()=>{
 const dir=room(),now=Date.parse('2026-11-20T09:00:00Z');const blog=blogStore(join(dir,'blog.sqlite'),{now:()=>now});
 const topic='Как выбрать пальто и с чем носить в повседневном гардеробе';
 let generated=0;const ai={discover:async()=>[{topic,score:90}],generate:async()=>{generated++;return{article:fixture({slug:'temporary',score:92})}}};
 const store={list:()=>[{id:1,cat:'Пальто',name:'Пальто',published:true,categories:['Пальто']}]};
 try{const one=await createDailyBlogDraft({blog,blogAI:ai,store,now:()=>now});assert.equal(one.created,true);assert.equal(one.article.published,false);assert.equal(one.article.slug,autoSlug(topic));
 const two=await createDailyBlogDraft({blog,blogAI:ai,store,now:()=>now});assert.equal(two.created,false);assert.equal(two.reason,'daily-limit');assert.equal(generated,1);assert.equal(blog.publicList().length,0)}finally{blog.close();rmSync(dir,{recursive:true,force:true})}
});

test('Qwen blog creates a valid draft from compact inference and distinct source domains',async()=>{
 const products=[{id:1,name:'Пальто прямого кроя',cat:'Пальто',categories:['Пальто'],published:true,description:'Удобная модель'}];
 const feed='<rss><channel>'+['one.example','one.example','two.example','three.example','four.example'].map((host,i)=>'<item><title>Советы по выбору пальто '+i+'</title><description>Подробный гид по выбору пальто и сочетаниям в гардеробе.</description><link>https://'+host+'/style</link></item>').join('')+'</channel></rss>';
 let prompt;
 const ai=createBlogAI({fetchImpl:async(url,options)=>{
  if(String(url).includes('bing.com'))return{ok:true,text:async()=>feed};
  prompt=JSON.parse(options.body);
  return{ok:true,json:async()=>({message:{content:JSON.stringify({title:'Как выбрать пальто для повседневного гардероба',summary:'Практические советы по выбору пальто и сочетанию вещей в базовом гардеробе.',sections:['Сначала определите, с какими вещами вы планируете носить пальто, и оцените удобство посадки.','Обратите внимание на сочетание силуэта с привычными брюками, юбками и обувью, не полагаясь только на фотографии.']})}})};
 }});
 const result=await ai.generate({topic:'Как выбрать пальто и с чем носить: гид по выбору одежды',products});
 assert.equal(result.rejected,false,JSON.stringify({sources:await ai.collectSources('Как выбрать пальто'),rank:scoreTopic('Как выбрать пальто и с чем носить: гид по выбору одежды',products,await ai.collectSources('Как выбрать пальто'))}));
 assert.equal(result.article.sources.length,4);
 assert.equal(result.article.productIds[0],1);
 assert.equal(prompt.options.num_ctx,1024);
 assert.equal(prompt.options.num_predict,170);
 assert.equal(prompt.messages[1].content.length<1600,true);
 const dir=room(),blog=blogStore(join(dir,'blog.sqlite'));
 try{assert.equal(blog.save(result.article).published,false)}finally{blog.close();rmSync(dir,{recursive:true,force:true})}
});

test('Qwen outage still returns a complete unpublished editorial draft',async()=>{
 const products=[{id:1,name:'Пальто',cat:'Пальто',categories:['Пальто'],published:true}];
 const feed='<rss><channel>'+['one.example','two.example','three.example'].map((host,i)=>'<item><title>Советы по выбору пальто '+i+'</title><description>Практический материал о выборе и сочетании одежды.</description><link>https://'+host+'/style</link></item>').join('')+'</channel></rss>';
 const ai=createBlogAI({fetchImpl:async url=>{
  if(String(url).includes('bing.com'))return{ok:true,text:async()=>feed};
  throw Error('Ollama unavailable');
 }});
 const result=await ai.generate({topic:'Как выбрать пальто и с чем носить: гид по выбору одежды',products});
 assert.equal(result.rejected,false);
 assert.match(result.warning,/Qwen недоступен/);
 const dir=room(),blog=blogStore(join(dir,'blog.sqlite'));
 try{const saved=blog.save(result.article);assert.equal(saved.published,false);assert.equal(saved.sections.length,3)}finally{blog.close();rmSync(dir,{recursive:true,force:true})}
});

test('only unpublished drafts can be deleted and public articles stay accessible',()=>{
 const dir=room(),store=blogStore(join(dir,'blog.sqlite'));
 try{
  const draft=store.save(fixture({slug:'delete-me'}));
  const published=store.save(fixture({slug:'keep-me'}));
  store.publish(published.id,true,[{id:1,published:true}]);
  assert.throws(()=>store.remove(published.id),e=>e.status===409);
  assert.equal(store.remove(draft.id).id,draft.id);
  assert.equal(store.list().some(a=>a.id===draft.id),false);
  assert.equal(store.publicOne('keep-me').id,published.id);
  assert.throws(()=>store.remove(draft.id),e=>e.status===404);
 }finally{store.close();rmSync(dir,{recursive:true,force:true})}
});

test('manual articles get automatic stable URL when slug is omitted',()=>{
 const dir=room(),store=blogStore(join(dir,'blog.sqlite'));
 try{
  const article=fixture();delete article.slug;
  const draft=store.save(article);
  assert.equal(draft.slug,autoSlug(article.title));
  const edited=store.save({...article,title:'Новое название статьи о выборе осеннего пальто'},draft.id);
  assert.equal(edited.slug,draft.slug);
  assert.throws(()=>store.save(article),e=>e.status===409);
 }finally{store.close();rmSync(dir,{recursive:true,force:true})}
});
