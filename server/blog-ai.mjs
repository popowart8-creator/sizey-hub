import {ContentError} from './content-store.mjs';

const fail=(message,status=400)=>{throw new ContentError(status,message)};
const entities=text=>text.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Math.min(1114111,Number(n)))).replace(/&amp;/g,'&');
const strip=text=>entities(text.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim());
const slug=text=>String(text||'').toLowerCase().replace(/[^a-z0-9а-яё\s-]/g,'').replace(/\s+/g,'-').slice(0,95);
function xmlItems(xml){
 const items=[];
 for(const match of xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)){
  const item=match[1],field=name=>strip(item.match(new RegExp('<'+name+'(?:\\s[^>]*)?>([\\s\\S]*?)<\\/'+name+'>','i'))?.[1]||'');
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
  // A valid, editable draft must not depend on a small model returning perfect JSON.
  const uniqueSources=[],domains=new Set();
  for(const source of sources){
   const host=new URL(source.url).hostname.replace(/^www\./,'').toLowerCase();
   if(!domains.has(host)){uniqueSources.push({title:source.title,url:source.url});domains.add(host)}
   if(uniqueSources.length>=6)break;
  }
  if(uniqueSources.length<2)return{rejected:true,score:rank.score,reason:'Недостаточно независимых интернет-источников',sources};
  const matched=products.filter(p=>rank.productIds.includes(p.id)).slice(0,3);
  const category=String(matched[0]?.cat||'одежды').trim().slice(0,80);
  const title=topic.trim().slice(0,140);
  const sections=[
   'При выборе '+category.toLowerCase()+' начните с собственных задач: где и как часто вы планируете носить вещь, с чем будете её сочетать и насколько вам удобно в выбранном фасоне. Сравните несколько вариантов перед покупкой.',
   'Оцените посадку и сочетаемость с уже имеющимся гардеробом. Сверяйте характеристики, размер и доступность с карточкой конкретного товара: они могут различаться даже у внешне похожих моделей.',
   'Для дополнительной проверки советов изучите указанные ниже независимые материалы. Ссылки приведены для редакторской проверки; содержание источников необходимо сверить перед публикацией.'
  ];
  const article={slug:'sizey-'+Date.now().toString(36),title,summary:'Практический черновик о выборе '+category.toLowerCase()+': на что обратить внимание и как сопоставить варианты с каталогом SIZEY.',sections,sources:uniqueSources,productIds:rank.productIds,score:rank.score};
  // Qwen only improves one paragraph. Its failure cannot destroy a useful draft.
  let warning=null;
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),35000);
  try{
   const request={model,stream:false,messages:[
    {role:'system',content:'Ты редактор магазина одежды. Верни только один абзац на русском языке (80–250 символов), без JSON, списков, выдуманных фактов, скидок и утверждений о наличии.'},
    {role:'user',content:JSON.stringify({topic:title,productNames:matched.map(p=>String(p.name||'').slice(0,65)),sourceHeadlines:uniqueSources.slice(0,2).map(x=>x.title.slice(0,80))})}
   ],options:{temperature:0.2,num_predict:170,num_ctx:1024},think:false};
   const response=await fetchImpl(endpoint.replace(/\/$/,'')+'/api/chat',{method:'POST',signal:controller.signal,headers:{'Content-Type':'application/json'},body:JSON.stringify(request)});
   if(!response.ok)throw Error('ollama-http-'+response.status);
   const data=await response.json();
   const paragraph=String(data.message?.content||'').trim().replace(/^["']|["']$/g,'');
   if(paragraph.length>=80&&paragraph.length<=500&&!/[\{\}\[\]]/.test(paragraph))article.sections[0]=paragraph;
   else warning='Qwen вернул неподходящий текст; сохранён базовый черновик';
  }catch(e){
   warning=controller.signal.aborted?'Qwen не ответил за 35 секунд; сохранён базовый черновик':'Qwen недоступен; сохранён базовый черновик';
  }finally{clearTimeout(timeout)}
  return{rejected:false,article,score:rank.score,reviewRequired:true,...(warning?{warning}:{})};
 }
 return{generate,discover,collectSources,scoreTopic};
}
export {scoreTopic};
