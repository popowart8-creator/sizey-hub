import {useEffect,useState} from 'react';
import {Bell} from 'lucide-react';
import './push-settings.css';
import {platform} from './Navigation';

async function pushRequest(action:string,data?:unknown){
 const response=await fetch('/hub-api/push/'+action,{
  credentials:'omit',cache:'no-store',
  ...(data===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)})
 });
 if(!response.ok)throw new Error('Сервис уведомлений временно недоступен. Попробуйте ещё раз.');
 return response.json();
}

async function bindCustomer(subscription:PushSubscription){
 await fetch('/hub-api/notifications/bind',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(subscription.toJSON())}).catch(()=>{});
}
export default function PushSettings({backgroundOnly=false}:{backgroundOnly?:boolean}={}){
 const [ready,setReady]=useState<{registration:ServiceWorkerRegistration;key:Uint8Array<ArrayBuffer>}>();
 const [current,setCurrent]=useState<PushSubscription|null>(null);
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState('');
 const ios=platform()==='ios';
 const standalone=matchMedia('(display-mode: standalone)').matches||
  (navigator as Navigator&{standalone?:boolean}).standalone;
 const requiresInstall=ios&&!standalone;
 const supported='serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window;
 const [retry,setRetry]=useState(0);
 useEffect(()=>{
  if(requiresInstall||!supported)return;
  let active=true;
  async function setup(){
   const {key}=await pushRequest('key');
   if(typeof key!=='string')throw new Error();
   const registration=await navigator.serviceWorker.ready;
   const applicationKey=Uint8Array.from(atob(key.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
   const saved=await registration.pushManager.getSubscription();
   if(active){setCurrent(saved);setReady({registration,key:applicationKey});setMessage('')}
   if(saved&&localStorage.getItem('sizey-push-disabled')!=='1'){await pushRequest('subscribe',{...saved.toJSON(),analytics:navigator.doNotTrack!=='1'}).catch(()=>{});await bindCustomer(saved)}
  }
  void setup().catch(()=>{if(active)setMessage('Не удалось подключиться к сервису уведомлений.')});
  return()=>{active=false};
 },[requiresInstall,supported,retry]);

 async function toggle(){
  if(!ready||busy)return;
  setBusy(true);
  setMessage('');
  try{
   if(current){
    await pushRequest('unsubscribe',current.toJSON());
    await current.unsubscribe();
    localStorage.setItem('sizey-push-disabled','1');
    setCurrent(null);
    setMessage('Уведомления отключены.');
    return;
   }
   if(Notification.permission==='denied'){
    setMessage('Разрешите уведомления для SIZEY в настройках устройства или браузера.');
    return;
   }
   if(Notification.permission==='default'){
    const permission=await Notification.requestPermission();
    if(permission!=='granted'){setMessage('Для включения уведомлений разрешите их в настройках устройства.');return}
   }
   const next=await ready.registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:ready.key});
   try{
    const privacy=navigator as Navigator&{globalPrivacyControl?:boolean};
    await pushRequest('subscribe',{...next.toJSON(),analytics:privacy.doNotTrack!=='1'&&!privacy.globalPrivacyControl});
   }catch(error){
    await next.unsubscribe().catch(()=>{});
    throw error;
   }
   await bindCustomer(next);
   localStorage.removeItem('sizey-push-disabled');
   setCurrent(next);
   setMessage('Уведомления включены.');
  }catch(error){
   if(Notification.permission==='denied'&&!current)setMessage('Разрешите уведомления для SIZEY в настройках устройства или браузера.');
   else setMessage(error instanceof Error&&error.name==='Error'?error.message:'Не удалось изменить подписку. Попробуйте ещё раз.');
  }finally{setBusy(false)}
 }

 if(backgroundOnly)return null;
 return <div className="push-settings">
  <label className="menu-row push-settings-row">
   <Bell size={23} aria-hidden="true"/>
   <span>Push-уведомления</span>
   <input type="checkbox" role="switch" checked={!!current} disabled={busy||!ready||requiresInstall||!supported} onChange={()=>void toggle()}/>
  </label>
  {requiresInstall?<p>Чтобы получать уведомления на iPhone, добавьте SIZEY на экран «Домой» через Safari и откройте приложение с иконки.</p>:!supported?<p>Уведомления не поддерживаются этим браузером.</p>:!ready?<p>{message||'Подключаем уведомления…'} <button type="button" onClick={()=>setRetry(value=>value+1)}>Повторить</button></p>:null}
  {ready&&message&&<p role="status">{message}</p>}
 </div>;
}
