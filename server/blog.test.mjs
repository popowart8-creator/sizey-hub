import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {blogStore} from './blog-store.mjs';
import {createBlogAI,scoreTopic} from './blog-ai.mjs';
import {analyticsStore} from './analytics.mjs';

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
  assert.throws(()=>store.save(fixture(),high.id),e=>e.status===409);
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
