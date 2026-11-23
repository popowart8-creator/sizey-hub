self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('push',event=>{
 let data={};try{data=event.data?.json()||{}}catch{}
 event.waitUntil(self.registration.showNotification(data.title||'SIZEY · Новый заказ',{body:data.body||'Поступил новый заказ',icon:'/brand/logo.svg',badge:'/brand/logo.svg',tag:'sizey-admin-order-'+Date.now(),data:{path:'/?section=orders'}}));
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();
 event.waitUntil((async()=>{
  const target=new URL('/?section=orders',self.location.origin).href;
  const clients=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  const existing=clients.find(client=>new URL(client.url).origin===self.location.origin);
  if(existing){await existing.navigate(target);return existing.focus()}
  return self.clients.openWindow(target);
 })());
});
