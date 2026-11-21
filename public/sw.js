const CACHE='sizey-v23';
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(['/','/brand/logo.svg'])));self.skipWaiting()});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('sizey-')&&key!==CACHE).map(key=>caches.delete(key)))));self.clients.claim()});
async function remember(request,response){if(response.ok){const type=response.headers.get('content-type')||'';if(!new URL(request.url).pathname.startsWith('/assets/')||/(javascript|text\/css)/.test(type)){const cache=await caches.open(CACHE);await cache.put(request,response.clone())}}return response}
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);
 if(request.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/hub-api/'))return;
 if(url.pathname.startsWith('/assets/')||url.pathname==='/sw.js'){event.respondWith(fetch(request,{cache:'no-store'}).catch(async()=>{const cache=await caches.open(CACHE);return await cache.match(request)||Response.error()}));return;}
 if(request.mode==='navigate'){
  event.respondWith((async()=>{const cache=await caches.open(CACHE);const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),4000);try{const response=await fetch(request,{cache:'no-store',signal:controller.signal});if(response.ok)await cache.put('/',response.clone());return response}catch{return await cache.match('/')||new Response('Нет подключения к интернету. Повторите вход после восстановления сети.',{status:503,headers:{'Content-Type':'text/plain;charset=utf-8'}})}finally{clearTimeout(timer)}})());return;
 }
 event.respondWith((async()=>{const cache=await caches.open(CACHE);const cached=await cache.match(request);if(cached)return cached;try{return await remember(request,await fetch(request))}catch{return Response.error()}})());
});

function reportPush(id,kind){
 if(typeof id!=='string'||!/^[a-f0-9]{48}$/.test(id))return Promise.resolve();
 const controller=new AbortController();
 const timeout=setTimeout(()=>controller.abort(),5000);
 return fetch('/hub-api/push/event',{
  method:'POST',credentials:'omit',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({id,kind}),signal:controller.signal
 }).catch(()=>{}).finally(()=>clearTimeout(timeout));
}

self.addEventListener('push',event=>{
 let data;
 try{data=event.data?.json()}catch{}
 const {title='SIZEY',body='Откройте SIZEY, чтобы узнать о новостях магазина.',path='/',id}=data||{};
 event.waitUntil(self.registration.showNotification(title,{
  body,icon:'/push-icon.svg',badge:'/push-icon.svg',data:{path,id}
 }).then(()=>reportPush(id,'shown')));
});

self.addEventListener('notificationclick',event=>{
 event.notification.close();
 const {path,id}=event.notification.data||{};
 let destination=new URL('/',self.location.origin);
 try{if(typeof path==='string'&&path.length<=1024&&path.startsWith('/')&&!path.startsWith('//')&&!path.includes('\\')&&!/[\u0000-\u001f\u007f]/.test(path)){
  const candidate=new URL(path,self.location.origin);
  if(candidate.origin===self.location.origin&&candidate.pathname==='/')destination=candidate;
 }}catch{}
 const open=async()=>{
  const tabs=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  const tab=tabs.find(client=>client.url===destination.href)||tabs.find(client=>new URL(client.url).origin===destination.origin);
  if(tab){
   const navigated=await tab.navigate(destination.href).catch(()=>null);
   if(navigated)return navigated.focus();
  }
  return self.clients.openWindow(destination.href);
 };
 event.waitUntil(Promise.all([open(),reportPush(id,'opened')]));
});
