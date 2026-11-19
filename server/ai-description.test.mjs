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
