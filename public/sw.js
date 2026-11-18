const CACHE='sizey-v13';
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(['/','/brand/logo.svg'])));self.skipWaiting()});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('sizey-')&&key!==CACHE).map(key=>caches.delete(key)))));self.clients.claim()});
async function remember(request,response){if(response.ok){const type=response.headers.get('content-type')||'';if(!new URL(request.url).pathname.startsWith('/assets/')||/(javascript|text\/css)/.test(type)){const cache=await caches.open(CACHE);await cache.put(request,response.clone())}}return response}
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);
 if(request.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/hub-api/'))return;
 if(request.mode==='navigate'){
  event.respondWith((async()=>{const cache=await caches.open(CACHE);const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),4000);try{const response=await fetch(request,{cache:'no-store',signal:controller.signal});if(response.ok)await cache.put('/',response.clone());return response}catch{return await cache.match('/')||new Response('Нет подключения к интернету. Повторите вход после восстановления сети.',{status:503,headers:{'Content-Type':'text/plain;charset=utf-8'}})}finally{clearTimeout(timer)}})());return;
 }
 event.respondWith((async()=>{const cache=await caches.open(CACHE);const cached=await cache.match(request);if(cached)return cached;try{return await remember(request,await fetch(request))}catch{return Response.error()}})());
});
