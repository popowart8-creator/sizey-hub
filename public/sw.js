const CACHE='sizey-v30';
const MEDIA_CACHE='sizey-media-v2';
const OFFLINE_API=new Set(['/hub-api/content','/hub-api/blog']);
self.addEventListener('install',event=>{
 event.waitUntil((async()=>{
  const cache=await caches.open(CACHE);
  const home=await fetch('/',{cache:'no-store'});
  if(!home.ok)throw Error('Offline shell unavailable');
  await cache.put('/',home.clone());
  const html=await home.text();
  // Cache the app entrypoint first. Optional admin/media assets must not prevent SW installation.
  const entry=[...html.matchAll(/(?:src|href)=["'](\/assets\/[^"'?#]+)["']/g)].map(match=>match[1]);
  const urls=['/brand/logo.svg','/brand/857220148072.webp','/brand/943151810212.webp','/brand/673427758392.webp','/manifest.webmanifest','/offline.html',...entry];
  const manifest=await fetch('/offline-assets.json',{cache:'no-store'}).catch(()=>null);
  if(manifest?.ok){
   const assets=await manifest.json().catch(()=>[]);
   if(Array.isArray(assets))urls.push(...assets.filter(x=>typeof x==='string'&&x.startsWith('/assets/')));
  }
  for(const url of [...new Set(urls)]){
   try{
    const response=await fetch(url,{cache:'no-store'});
    if(!response.ok)continue;
    if((url.endsWith('.js')||url.endsWith('.css'))&&!['javascript','text/css'].some(type=>(response.headers.get('content-type')||'').includes(type)))continue;
    await cache.put(url,response);
   }catch{}
  }
  // Do not activate an incomplete shell: the initial JS/CSS is required offline.
  for(const url of entry)if(!await cache.match(url))throw Error('Offline entry asset unavailable: '+url);
 })());
 self.skipWaiting();
});
self.addEventListener('activate',event=>{
 event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('sizey-')&&key!==CACHE&&key!==MEDIA_CACHE).map(key=>caches.delete(key)))));
 self.clients.claim();
});
async function cacheResponse(cache,request,response){
 if(response.ok&&response.type!=='opaque'&&(!new URL(request.url).pathname.startsWith('/assets/')||/(javascript|text\/css)/.test(response.headers.get('content-type')||'')))await cache.put(request,response.clone());
 return response;
}
// Keep catalog thumbnails on disk, even if their cards were not scrolled into view.
self.addEventListener('message',event=>{
 if(event.data?.type!=='CACHE_CATALOG_IMAGES'||!Array.isArray(event.data.urls))return;
 const urls=[...new Set(event.data.urls)].filter(url=>typeof url==='string'&&url.startsWith('/brand/')&&!url.includes('..')).slice(0,500);
 event.waitUntil((async()=>{
  const cache=await caches.open(MEDIA_CACHE);
  let index=0;
  await Promise.all(Array.from({length:4},async()=>{
   while(index<urls.length){
    const path=urls[index++];
    const request=new Request(path,{credentials:'omit'});
    if(await cache.match(request))continue;
    try{const response=await fetch(request);if(response.ok&&response.headers.get('content-type')?.startsWith('image/'))await cache.put(request,response)}catch{}
   }
  }));
 })());
});
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);
 if(request.method!=='GET'||url.origin!==self.location.origin)return;
 if(url.pathname.startsWith('/hub-api/')){
  // Cache only public, anonymous catalog/blog data; never store private API responses.
  if(!OFFLINE_API.has(url.pathname)||request.headers.has('authorization'))return;
  event.respondWith((async()=>{
   const cache=await caches.open(CACHE);
   try{
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),5000);
    try{
     const response=await fetch(request,{cache:'no-store',credentials:'omit',signal:controller.signal});
     if(response.ok)await cacheResponse(cache,request,response);
     return response.ok?response:(await cache.match(request))||response;
    }finally{clearTimeout(timer)}
   }catch{return await cache.match(request)||Response.error()}
  })());
  return;
 }
 if(url.pathname==='/sw.js')return;
 if(request.mode==='navigate'){
  event.respondWith((async()=>{
   const cache=await caches.open(CACHE);
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),4000);
   try{
    const response=await fetch(request,{cache:'no-store',signal:controller.signal});
    if(response.ok)await cache.put('/',response.clone());
    return response.ok?response:(await cache.match('/')||await cache.match('/offline.html')||response);
   }catch{return await cache.match('/')||await cache.match('/offline.html')||Response.error()}
   finally{clearTimeout(timer)}
  })());
  return;
 }
 if(url.pathname.startsWith('/assets/')){
  event.respondWith((async()=>{
   const cache=await caches.open(CACHE);
   try{
    const response=await fetch(request,{cache:'no-store'});
    return await cacheResponse(cache,request,response);
   }catch{return await cache.match(request)||Response.error()}
  })());
  return;
 }
 event.respondWith((async()=>{
  const cache=await caches.open(request.destination==='image'?MEDIA_CACHE:CACHE);
  const saved=await cache.match(request);
  if(saved)return saved;
  try{return await cacheResponse(cache,request,await fetch(request))}catch{return Response.error()}
 })());
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
