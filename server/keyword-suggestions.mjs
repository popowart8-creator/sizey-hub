import {ContentError} from './content-store.mjs';

// Free, unofficial autocomplete endpoints: suggestions are not search volumes.
const clean=value=>String(value||'').replace(/[\u0000-\u001f]/g,' ').trim();
const providers={
 google:q=>{const url=new URL('https://suggestqueries.google.com/complete/search');url.searchParams.set('client','firefox');url.searchParams.set('hl','ru');url.searchParams.set('q',q);return url},
 yandex:q=>{const url=new URL('https://suggest.yandex.ru/suggest-ya.cgi');url.searchParams.set('part',q);url.searchParams.set('v','4');url.searchParams.set('uil','ru');return url}
};
export function createKeywordSuggestions({fetchImpl=fetch,now=Date.now}={}){
 const cache=new Map(),inflight=new Map();
 async function source(name,q){
  let response;
  try{response=await fetchImpl(providers[name](q),{signal:AbortSignal.timeout(5000),headers:{'User-Agent':'Mozilla/5.0 (compatible; SIZEY-SEO/1.0)'}})}
  catch{return{suggestions:[],available:false}}
  if(!response.ok)return{suggestions:[],available:false};
  let parsed;
  try{const body=await response.text();if(body.length>30000)throw Error('large');parsed=JSON.parse(body)}
  catch{return{suggestions:[],available:false}}
  const suggestions=Array.isArray(parsed?.[1])?[...new Set(parsed[1].filter(v=>typeof v==='string').map(clean).filter(v=>v.length>=3&&v.length<=120))].slice(0,12):[];
  return{suggestions,available:true};
 }
 async function suggest(query){
  const q=clean(query);
  if(q.length<3||q.length>100)throw new ContentError(400,'Укажите запрос от 3 до 100 символов');
  const key=q.toLocaleLowerCase('ru');
  const hit=cache.get(key);if(hit&&hit.expires>now())return hit.value;
  if(inflight.has(key))return inflight.get(key);
  const work=(async()=>{
   const [google,yandex]=await Promise.all([source('google',q),source('yandex',q)]);
   if(!google.available&&!yandex.available)throw new ContentError(503,'Поисковые подсказки временно недоступны');
   const suggestions=[...new Set([...google.suggestions,...yandex.suggestions])].slice(0,20);
   const value={query:q,suggestions,sources:{google,yandex},source:'Google и Яндекс (неофициальные подсказки)',volumeAvailable:false};
   if(cache.size>=300)cache.delete(cache.keys().next().value);
   cache.set(key,{value,expires:now()+6*60*60*1000});
   return value;
  })();
  inflight.set(key,work);try{return await work}finally{inflight.delete(key)}
 }
 return{suggest};
}
