const DB='sizey-offline-media';
const STORE='photos';
const CACHE='sizey-media-v2';
export const isAdminPhoto=(url:string)=>typeof url==='string'&&url.startsWith('/hub-api/media/')&&['.jpg','.png','.webp'].some(ext=>url.endsWith(ext));
let opening:Promise<IDBDatabase>|undefined;
function database():Promise<IDBDatabase>{
 if(!('indexedDB' in window))return Promise.reject(Error('IndexedDB unavailable'));
 return opening??=new Promise((resolve,reject)=>{
  const request=indexedDB.open(DB,1);
  request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains(STORE))request.result.createObjectStore(STORE)};
  request.onsuccess=()=>{request.result.onversionchange=()=>request.result.close();resolve(request.result)};
  request.onerror=()=>reject(request.error);
 }).catch(error=>{opening=undefined;throw error});
}
async function stored(url:string):Promise<Blob|undefined>{
 try{const db=await database();return await new Promise((resolve,reject)=>{
  const request=db.transaction(STORE,'readonly').objectStore(STORE).get(url);
  request.onsuccess=()=>resolve(request.result instanceof Blob?request.result:undefined);
  request.onerror=()=>reject(request.error);
 })}catch{return undefined}
}
async function save(url:string,blob:Blob):Promise<boolean>{
 try{const db=await database();await new Promise<void>((resolve,reject)=>{
  const transaction=db.transaction(STORE,'readwrite');
  transaction.objectStore(STORE).put(blob,url);
  transaction.oncomplete=()=>resolve();
  transaction.onerror=()=>reject(transaction.error);
  transaction.onabort=()=>reject(transaction.error);
 });return !!(await stored(url))}catch{return false}
}
export async function cachedAdminPhoto(url:string):Promise<Blob|undefined>{
 if(!isAdminPhoto(url))return;
 const idb=await stored(url);if(idb)return idb;
 try{if('caches' in window){const response=await caches.match(url);if(response?.ok){const blob=await response.blob();if(blob.type.startsWith('image/')){void save(url,blob);return blob}}}}catch{}
}
const inFlight=new Map<string,Promise<boolean>>();
export function persistAdminPhoto(url:string):Promise<boolean>{
 if(!isAdminPhoto(url))return Promise.resolve(false);
 const existing=inFlight.get(url);if(existing)return existing;
 const job=(async()=>{
  if(await cachedAdminPhoto(url))return true;
  if(!navigator.onLine)return false;
  try{
   const response=await fetch(url,{credentials:'omit',cache:'force-cache'});
   if(!response.ok||!response.headers.get('content-type')?.startsWith('image/'))return false;
   const blob=await response.blob();
   if(!blob.size)return false;
   const durable=await save(url,blob);
   try{if('caches' in window){const cache=await caches.open(CACHE);await cache.put(url,new Response(blob,{headers:{'Content-Type':blob.type}}))}}catch{}
   return durable||!!(await cachedAdminPhoto(url));
  }catch{return false}
 })().finally(()=>inFlight.delete(url));
 inFlight.set(url,job);return job;
}
export async function persistCatalogPhotos(urls:string[]):Promise<void>{
 const unique=[...new Set(urls.filter(isAdminPhoto))];
 let cursor=0;
 await Promise.all(Array.from({length:2},async()=>{while(cursor<unique.length&&navigator.onLine){await persistAdminPhoto(unique[cursor++])}}));
}
