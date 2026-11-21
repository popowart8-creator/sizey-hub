import {useEffect,useRef,useState} from 'react';
import {Bell,Gift,Sparkles,Shirt} from 'lucide-react';
import CustomerSheet from './CustomerSheet';
import MenuRow from './MenuRow';
import {platform} from './Navigation';
import PushArtwork from './PushArtwork';

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
const DAY=24*60*60*1000;
const PUSH_REMINDER_KEY='sizey-push-next-reminder';
const PUSH_DISMISSALS_KEY='sizey-push-dismissals';

export default function PushSettings({onboardingOnly=false,onboardingEnabled=true}:{onboardingOnly?:boolean;onboardingEnabled?:boolean}={}){
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
 const [open,setOpen]=useState(false);
 const [onboarding,setOnboarding]=useState(false);
 const onboardingDialog=useRef<HTMLDialogElement>(null);
 function dismissOnboarding(){
  if(Notification.permission!=='granted'&&!current){
   const previous=Number(localStorage.getItem(PUSH_DISMISSALS_KEY)||'0');
   const count=previous+1;
   localStorage.setItem(PUSH_DISMISSALS_KEY,String(count));
   localStorage.setItem(PUSH_REMINDER_KEY,String(Date.now()+(count===1?3:5)*DAY));
  }
  setOnboarding(false);
 }
 useEffect(()=>{if(!onboarding)return;const dialog=onboardingDialog.current;if(!dialog)return;dialog.showModal();requestAnimationFrame(()=>{if(document.activeElement instanceof HTMLElement)document.activeElement.blur()});return()=>dialog.close()},[onboarding]);
 useEffect(()=>{
  if(!onboardingOnly||!onboardingEnabled||!standalone||!supported||Notification.permission!=='default')return;
  const next=Number(localStorage.getItem(PUSH_REMINDER_KEY)||'0');
  if(Number.isFinite(next)&&next>Date.now())return;
  setOnboarding(true);
 },[onboardingOnly,onboardingEnabled,standalone,supported]);

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
   localStorage.removeItem(PUSH_REMINDER_KEY);
   localStorage.removeItem(PUSH_DISMISSALS_KEY);
   setOnboarding(false);
   setMessage('Уведомления включены.');
  }catch(error){
   if(Notification.permission==='denied'&&!current)setMessage('Разрешите уведомления для SIZEY в настройках устройства или браузера.');
   else setMessage(error instanceof Error&&error.name==='Error'?error.message:'Не удалось изменить подписку. Попробуйте ещё раз.');
  }finally{setBusy(false)}
 }

 return <>
  {!onboardingOnly&&<MenuRow icon={<Bell size={23}/>} opensDialog onClick={()=>setOpen(true)}>Уведомления</MenuRow>}
  {onboarding&&<dialog ref={onboardingDialog} aria-labelledby="push-onboarding-title" onCancel={dismissOnboarding} className="push-onboarding-modal" style={{position:'fixed',inset:0,width:'100%',height:'100%',maxWidth:'none',maxHeight:'none',margin:0,border:0,padding:0,background:'var(--dark-canvas, #fff)',color:'var(--color-primary, #333)',overflowY:'auto'}}>
   <div style={{minHeight:'100%',display:'flex',flexDirection:'column',padding:'max(24px, env(safe-area-inset-top)) 24px max(24px, env(safe-area-inset-bottom))',boxSizing:'border-box'}}>
    <div style={{flex:1,display:'flex',flexDirection:'column',justifyContent:'center',maxWidth:440,width:'100%',margin:'0 auto',gap:24}}>
     <PushArtwork/>
     <div className="push-onboarding-heading"><h1 id="push-onboarding-title">Будь в курсе всего важного</h1><p>Включи уведомления SIZEY, чтобы ничего не пропустить.</p></div>
     <div style={{display:'grid',gap:22}}>
      <div style={{display:'flex',gap:16,alignItems:'flex-start'}}><Gift size={25} aria-hidden="true"/><div><strong>Бонусы</strong><p style={{margin:'5px 0 0',color:'var(--color-secondary)'}}>Узнавай о начислениях, бонусных предложениях и возможностях их использовать.</p></div></div>
      <div style={{display:'flex',gap:16,alignItems:'flex-start'}}><Sparkles size={25} aria-hidden="true"/><div><strong>Новости и предложения</strong><p style={{margin:'5px 0 0',opacity:.7}}>Получай новости SIZEY, специальные предложения и важные обновления.</p></div></div>
      <div style={{display:'flex',gap:16,alignItems:'flex-start'}}><Shirt size={25} aria-hidden="true"/><div><strong>Новые коллекции</strong><p style={{margin:'5px 0 0',opacity:.7}}>Первым узнавай о новых поступлениях и коллекциях.</p></div></div>
     </div>
     {message&&<p role="status">{message}</p>}
     <div className="push-onboarding-actions"><button type="button" className="blackbtn" disabled={!ready||busy} onClick={()=>void toggle()}>{busy?'Подключаем…':ready?'Включить уведомления':'Подключаем сервис…'}</button><button type="button" onClick={dismissOnboarding} className="push-onboarding-later">Не сейчас</button></div>
    </div>
   </div>
  </dialog>}
  {!onboardingOnly&&open&&<CustomerSheet title="Уведомления" onClose={()=>setOpen(false)}>
   <div className="push-settings-row" style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:16,padding:'12px 0'}}>
    <div><strong>Push-уведомления</strong><p style={{color:'var(--text-secondary, #777)',fontSize:13,margin:'6px 0 0'}}>Получайте новости, предложения и важные обновления SIZEY.</p></div>
    <input type="checkbox" role="switch" aria-label="Push-уведомления" checked={!!current} disabled={busy||!ready||requiresInstall||!supported} onChange={()=>void toggle()} style={{accentColor:'#34c759',flexShrink:0}} {...(ios?{switch:''}: {})}/>
   </div>
   {requiresInstall?<p>Чтобы получать уведомления на iPhone, добавьте SIZEY на экран «Домой» через Safari и откройте приложение с иконки.</p>:!supported?<p>Уведомления не поддерживаются этим браузером.</p>:!ready?<p>Подключаем уведомления… <button type="button" onClick={()=>setRetry(value=>value+1)}>Повторить</button></p>:null}
   {ready&&!current&&Notification.permission==='default'&&<button type="button" disabled={busy} onClick={()=>void toggle()}>Разрешить уведомления</button>}
   {message&&<p role="status" style={{fontSize:13}}>{message}</p>}
  </CustomerSheet>}
 </>;
}
