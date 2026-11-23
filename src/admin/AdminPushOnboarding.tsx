import {useEffect,useState} from 'react';
import {BellRing,PackageCheck} from 'lucide-react';
type Props={onClose:()=>void};
const keyBytes=(value:string)=>{const raw=atob(value.replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(value.length/4)*4,'='));return Uint8Array.from(raw,char=>char.charCodeAt(0))};
export default function AdminPushOnboarding({onClose}:Props){
 const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const supported=typeof window!=='undefined'&&'serviceWorker'in navigator&&'PushManager'in window&&'Notification'in window;
 useEffect(()=>{if(supported&&Notification.permission==='granted')void enroll(false)},[]);
 async function enroll(ask=true){
  if(!supported)return setMessage('Уведомления не поддерживаются на этом устройстве.');
  setBusy(true);setMessage('');
  try{
   if(ask&&Notification.permission==='default'){const result=await Notification.requestPermission();if(result!=='granted')throw new Error('Разрешите уведомления в настройках браузера или устройства.')}
   if(Notification.permission!=='granted')throw new Error('Уведомления заблокированы. Разрешите их в настройках устройства.');
   const registration=await navigator.serviceWorker.register('/admin-sw.js',{scope:'/'});
   await navigator.serviceWorker.ready;
   const response=await fetch('/hub-api/admin/device-push',{credentials:'include'});
   if(!response.ok)throw new Error('Войдите в админку повторно.');
   const {key}=await response.json();
   let subscription=await registration.pushManager.getSubscription();
   if(!subscription)subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:keyBytes(key)});
   const saved=await fetch('/hub-api/admin/device-push',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify(subscription.toJSON())});
   if(!saved.ok)throw new Error('Не удалось сохранить подписку. Попробуйте снова.');
   localStorage.setItem('sizey-admin-push-enabled','1');onClose();
  }catch(error){setMessage(error instanceof Error?error.message:'Не удалось подключить уведомления')}
  finally{setBusy(false)}
 }
 return <div className="admin-push-onboarding" role="dialog" aria-modal="true" aria-label="Уведомления о заказах"><div className="admin-push-art" aria-hidden="true"><div className="admin-push-art-box"><PackageCheck size={82} strokeWidth={1.1}/></div><div className="admin-push-art-bell"><BellRing size={35}/></div></div><h1>Не пропускайте новые заказы</h1><p>Включите уведомления SIZEY — сообщим сразу, как покупатель оформит заказ.</p>{message&&<p className="admin-push-error" role="alert">{message}</p>}<button className="primary" disabled={busy} onClick={()=>void enroll()}>{busy?'Подключаем…':'Включить уведомления'}</button><button className="secondary" onClick={onClose}>Позже</button></div>
}
