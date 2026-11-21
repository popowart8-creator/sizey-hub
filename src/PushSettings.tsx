import {useEffect,useState} from 'react';
import {Bell} from 'lucide-react';
import MenuRow from './MenuRow';
import {platform} from './Navigation';

async function pushRequest(action:string,data?:unknown){
 const response=await fetch('/hub-api/push/'+action,{
  credentials:'omit',cache:'no-store',
  ...(data===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)})
 });
 if(!response.ok)throw new Error('Сервис уведомлений временно недоступен. Попробуйте ещё раз.');
 return response.json();
}

export default function PushSettings(){
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
    setCurrent(null);
    setMessage('Уведомления отключены.');
    return;
   }
   if(Notification.permission==='denied'){
    setMessage('Разрешите уведомления для SIZEY в настройках устройства или браузера.');
    return;
   }
   const next=await ready.registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:ready.key});
   try{
    const privacy=navigator as Navigator&{globalPrivacyControl?:boolean};
    await pushRequest('subscribe',{...next.toJSON(),analytics:privacy.doNotTrack!=='1'&&!privacy.globalPrivacyControl});
   }catch(error){
    await next.unsubscribe().catch(()=>{});
    throw error;
   }
   setCurrent(next);
   setMessage('Уведомления включены.');
  }catch(error){
   if(Notification.permission==='denied'&&!current)setMessage('Разрешите уведомления для SIZEY в настройках устройства или браузера.');
   else setMessage(error instanceof Error&&error.name==='Error'?error.message:'Не удалось изменить подписку. Попробуйте ещё раз.');
  }finally{setBusy(false)}
 }

 return <section className="profile-utilities menu-list" aria-label="Уведомления">
  {requiresInstall?<p>Чтобы получать уведомления на iPhone или iPad, откройте SIZEY в Safari, выберите «Поделиться» → «На экран Домой» и запустите приложение с иконки.</p>:
   !supported?<p>Этот браузер не поддерживает push-уведомления SIZEY.</p>:
   <MenuRow icon={<Bell size={23}/>} onClick={()=>ready?void toggle():setRetry(value=>value+1)} disabled={busy||!ready&&!message} chevron={false}>
    {ready?(current?'Отключить уведомления':'Включить уведомления'):message?'Повторить подключение уведомлений':'Подключение уведомлений…'}
   </MenuRow>}
  {message&&<p role="status">{message}</p>}
 </section>;
}
