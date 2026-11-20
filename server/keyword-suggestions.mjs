import {ContentError} from './content-store.mjs';

// Public search suggestions are hints, not verified keyword volumes.
// Keep requests server-side, bounded and optional; never block product editing.
const clean=value=>String(value||'').replace(/[\u0000-\u001f]/g,' ').trim();
export function createKeywordSuggestions({fetchImpl=fetch,now=Date.now}={}){
 const cache=new Map(),inflight=new Map();
 async function suggest(query){
  const q=clean(query);
  if(q.length<3||q.length>100)throw new ContentError(400,'Укажите запрос от 3 до 100 символов');
  const key=q.toLocaleLowerCase('ru');
  const hit=cache.get(key);if(hit&&hit.expires>now())return hit.value;
  if(inflight.has(key))return inflight.get(key);
  const work=(async()=>{
   const url=new URL('https://suggestqueries.google.com/complete/search');
   url.searchParams.set('client','firefox');url.searchParams.set('hl','ru');url.searchParams.set('q',q);
   let response;
   try{response=await fetchImpl(url,{signal:AbortSignal.timeout(5000),headers:{'User-Agent':'SIZEY/1.0'}})}
   catch{throw new ContentError(503,'Поисковые подсказки временно недоступны')}
   if(!response.ok)throw new ContentError(503,'Источник поисковых подсказок недоступен');
   const body=await response.text();if(body.length>30000)throw new ContentError(502,'Слишком большой ответ источника');
   let parsed;try{parsed=JSON.parse(body)}catch{throw new ContentError(502,'Некорректный ответ источника')}
   const suggestions=Array.isArray(parsed?.[1])?[...new Set(parsed[1].filter(v=>typeof v==='string').map(clean).filter(v=>v.length>=3&&v.length<=120))].slice(0,12):[];
   const value={query:q,suggestions,source:'Google Autocomplete (неофициальный)',volumeAvailable:false};
   if(cache.size>=300)cache.delete(cache.keys().next().value);
   cache.set(key,{value,expires:now()+6*60*60*1000});
   return value;
  })();
  inflight.set(key,work);try{return await work}finally{inflight.delete(key)}
 }
 return{suggest};
}
