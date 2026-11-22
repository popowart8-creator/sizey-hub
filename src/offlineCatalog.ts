// Durable offline catalog snapshot. Never store customer or authentication data here.
export type OfflineCatalog<T>={products:T[];categories:string[];banners:unknown[];savedAt:number};
const DB='sizey-offline-v1',STORE='catalog';
function open():Promise<IDBDatabase>{
 return new Promise((resolve,reject)=>{
  if(!('indexedDB'in window)){reject(Error('IndexedDB unavailable'));return}
  const request=indexedDB.open(DB,1);
  request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains(STORE))request.result.createObjectStore(STORE)};
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>reject(request.error);
 });
}
export async function loadOfflineCatalog<T>():Promise<OfflineCatalog<T>|null>{
 const db=await open();
 return new Promise(resolve=>{
  const tx=db.transaction(STORE,'readonly'),request=tx.objectStore(STORE).get('latest');
  request.onsuccess=()=>{const data=request.result;resolve(data&&Array.isArray(data.products)&&Array.isArray(data.categories)&&Array.isArray(data.banners)?data:null)};
  request.onerror=()=>resolve(null);
  tx.oncomplete=()=>db.close();tx.onabort=()=>db.close();
 });
}
export async function saveOfflineCatalog<T>(data:OfflineCatalog<T>):Promise<void>{
 const db=await open();
 return new Promise((resolve,reject)=>{
  const tx=db.transaction(STORE,'readwrite');
  tx.objectStore(STORE).put(data,'latest');
  tx.oncomplete=()=>{db.close();resolve()};
  tx.onerror=()=>{db.close();reject(tx.error)};
  tx.onabort=()=>{db.close();reject(tx.error)};
 });
}
