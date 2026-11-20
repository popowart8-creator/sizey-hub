import {ContentError} from './content-store.mjs';

const fail=(message,status=400)=>{throw new ContentError(status,message)};
const entities=text=>text.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Math.min(1114111,Number(n)))).replace(/&amp;/g,'&');
const strip=text=>entities(text.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim());
const slug=text=>String(text||'').toLowerCase().replace(/[^a-z0-9а-яё\s-]/g,'').replace(/\s+/g,'-').slice(0,95);
function xmlItems(xml){
 const items=[];
 for(const match of xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)){
  const item=match[1],field=name=>strip(item.match(new RegExp('<'+name+'(?:\s[^>]*)?>([\s\S]*?)<\/'+name+'>','i'))?.[1]||'');
  const title=field('title'),description=field('description'),url=field('link');
  if(!title||!description||title.length>240)continue;
  try{const u=new URL(url);if(u.protocol==='https:'&&u.hostname!=='www.bing.com'&&u.hostname!=='bing.com')items.push({title,description:description.slice(0,700),url:u.href})}catch{/* ignore malformed feed */ }
 }
 return items;
}
function scoreTopic(topic,products,sources){
 const terms=String(topic).toLowerCase(),purchase=/(купить|выбрать|подобрать|с чем носить|как носить|сочетать|сравн|размер|фасон|образ|плать|юбк|брюк|пальто|куртк|рубашк|блузк|тренч|костюм|джинс)/i.test(terms);
 const productTerms=products.filter(p=>p.published!==false).filter(p=>[p.name,p.cat,...(p.categories||[])].some(s=>s&&s.toLowerCase().split(/\s+/).some(w=>w.length>=4&&terms.includes(w.slice(0,Math.max(4,w.length-2))))));
 const domains=new Set(sources.map(s=>{try{return new URL(s.url).hostname.replace(/^www\./,'')}catch{return''}}).filter(Boolean));
 const score=Math.min(100,(purchase?35:0)+(productTerms.length?30:0)+(domains.size>=2?20:0)+(sources.length>=3?10:0)+(sources.length>=5?5:0));
 return{score,productIds:productTerms.slice(0,5).map(p=>p.id)};
}
export function createBlogAI({fetchImpl=fetch,endpoint=process.env.OLLAMA_URL||'http://127.0.0.1:11434',model=process.env.OLLAMA_MODEL||'qwen2.5:1.5b'}={}){
 async function collectSources(topic){
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),10000);
  try{
   const response=await fetchImpl('https://www.bing.com/search?format=rss&q='+encodeURIComponent(topic+' женская одежда стиль выбор'),{signal:controller.signal,headers:{Accept:'application/rss+xml, application/xml;q=0.9'}});
   if(!response.ok)throw Error('RSS unavailable');
   const text=await response.text();if(text.length>500000)throw Error('RSS too large');
   return xmlItems(text).slice(0,10);
  }catch{return []}finally{clearTimeout(timeout)}
 }
 async function discover(products){
  const categories=[...new Set(products.filter(p=>p.published!==false).flatMap(p=>[p.cat,...(p.categories||[])]) )]
    .filter(c=>typeof c==='string'&&c.trim().length>=4&&!/^(все|новинки)/i.test(c)).slice(0,7);
  const results=[];
  for(const category of categories){
   const topic='Как выбрать '+category.toLowerCase()+' и с чем носить: гид по выбору одежды';
   const sources=await collectSources(topic),rank=scoreTopic(topic,products,sources);
   if(rank.score>=85)results.push({topic,score:rank.score,sourceCount:sources.length,productIds:rank.productIds});
   if(results.length>=5)break;
  }
  return results.sort((a,b)=>b.score-a.score);
 }
 async function generate({topic,products}){
  if(typeof topic!=='string'||topic.trim().length<12||topic.length>140)fail('Тема должна содержать от 12 до 140 символов');
  const sources=await collectSources(topic.trim()),rank=scoreTopic(topic,products,sources);
  if(rank.score<85) return{rejected:true,score:rank.score,reason:sources.length<2?'Недостаточно независимых интернет-источников для проверенного материала':'Низкий коммерческий потенциал или нет подходящих товаров',sources};
  // Keep inference small enough for a local 1.5B model; the complete sources stay in the draft.
  const allowedProducts=products.filter(p=>rank.productIds.includes(p.id)).slice(0,3).map(p=>({name:String(p.name||'').slice(0,100),cat:String(p.cat||'').slice(0,60),description:String(p.description||'').slice(0,180)}));
  const evidence=sources.slice(0,5).map(s=>({title:s.title.slice(0,130),description:s.description.slice(0,220)}));
  const system='Ты редактор магазина одежды SIZEY. Ответь одним JSON-объектом: {"title":"...","summary":"...","sections":["...","...","..."]}. Заголовок 12-140 символов, summary 40-300 символов, 3-4 абзаца по 80-350 символов. Только проверяемые сведения из данных; не придумывай факты, скидки, составы, наличие и цифры. Пиши по-русски, без markdown.';
  const request={model,stream:false,format:'json',messages:[{role:'system',content:system},{role:'user',content:JSON.stringify({topic,sources:evidence,products:allowedProducts})}],options:{temperature:0.15,num_predict:1100,num_ctx:3072},think:false};
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),115000);
  try{
   let response;
   try{response=await fetchImpl(endpoint.replace(/\/$/,'')+'/api/chat',{method:'POST',signal:controller.signal,headers:{'Content-Type':'application/json'},body:JSON.stringify(request)})}
   catch(e){if(controller.signal.aborted)fail('Qwen превысил лимит времени (115 секунд). Попробуйте ещё раз.',504);fail('Нет соединения с локальной моделью Qwen',503)}
   if(!response.ok)fail('Qwen отклонил запрос (HTTP '+response.status+')',503);
   let data;
   try{data=await response.json()}catch{fail('Qwen вернул повреждённый ответ',502)}
   let article;
   try{
    const raw=String(data.message?.content||'').trim().replace(/^\`\`\`(?:json)?\s*/i,'').replace(/\s*\`\`\`$/,'');
    article=JSON.parse(raw);
   }catch{fail('Qwen вернул некорректный JSON. Повторите генерацию.',502)}
   if(!article||typeof article.title!=='string'||article.title.trim().length<12||typeof article.summary!=='string'||article.summary.trim().length<30||!Array.isArray(article.sections)||article.sections.length<2||article.sections.some(x=>typeof x!=='string'||x.trim().length<50))fail('Qwen создал неполный текст. Повторите генерацию.',502);
   const uniqueSources=[],domains=new Set();
   for(const source of sources){const host=new URL(source.url).hostname.replace(/^www\./,'').toLowerCase();if(!domains.has(host)){uniqueSources.push({title:source.title,url:source.url});domains.add(host)}if(uniqueSources.length>=6)break}
   if(uniqueSources.length<2)fail('Недостаточно независимых источников',422);
   return{rejected:false,article:{slug:'sizey-'+Date.now().toString(36),title:article.title.trim().slice(0,140),summary:article.summary.trim().slice(0,450),sections:article.sections.slice(0,8).map(x=>x.trim().slice(0,2500)),sources:uniqueSources,productIds:rank.productIds,score:rank.score},score:rank.score,reviewRequired:true};
  }finally{clearTimeout(timeout)}

 }
 return{generate,discover,collectSources,scoreTopic};
}
export {scoreTopic};
