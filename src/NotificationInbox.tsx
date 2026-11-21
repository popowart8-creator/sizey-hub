import {useEffect,useState} from 'react';
import {Bell,CheckCheck} from 'lucide-react';

type Notice={id:string;title:string;message:string;path:string;created:number;read:number};
export default function NotificationInbox({onOpen,onBack}:{onOpen?:()=>void;onBack?:()=>void}){
 const open=!onOpen;
 const [items,setItems]=useState<Notice[]>([]);
 const [error,setError]=useState('');
 const [loading,setLoading]=useState(false);
 useEffect(()=>{
  if(!open)return;
  let active=true;
  async function load(){
   setLoading(true);setError('');
   try{
    const response=await fetch('/hub-api/notifications',{credentials:'same-origin',cache:'no-store'});
    if(response.status===401)throw Error('Войдите в профиль, чтобы видеть личные уведомления.');
    if(!response.ok)throw Error('Не удалось загрузить уведомления.');
    const data=await response.json();
    if(active)setItems(data.notifications||[]);
    // Load the inbox first; service-worker subscription binding must never block history.
    if('serviceWorker'in navigator&&'PushManager'in window){
     try{
      const registration=await navigator.serviceWorker.getRegistration();
      const subscription=await registration?.pushManager?.getSubscription();
      if(subscription){
       const bound=await fetch('/hub-api/notifications/bind',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(subscription.toJSON())});
       if(bound.ok){
        const refreshed=await fetch('/hub-api/notifications',{credentials:'same-origin',cache:'no-store'});
        if(refreshed.ok&&active)setItems((await refreshed.json()).notifications||[]);
       }
      }
     }catch{/* History remains available without push permissions. */}
    }
   }catch(reason){if(active)setError(reason instanceof Error?reason.message:'Ошибка загрузки')}
   finally{if(active)setLoading(false)}
  }
  void load();
  return()=>{active=false};
 },[open]);
 async function read(item:Notice){
  if(!item.read){
   try{const response=await fetch('/hub-api/notifications/read',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:item.id})});if(response.ok)setItems(items=>items.map(x=>x.id===item.id?{...x,read:1}:x))}catch{/* can retry on next open */}
  }
  onBack?.();
  if(item.path.startsWith('/')&&!item.path.startsWith('//'))window.location.assign(item.path);
 }
 const unread=items.filter(x=>!x.read).length;
 return <>
  {onOpen&&<button type="button" className="profile-notification-button" aria-label="Уведомления" onClick={onOpen}><Bell size={24} strokeWidth={1.8}/>{unread>0&&<span className="profile-notification-dot"/>}</button>}
  {open&&<main className="native-detail-content notification-screen-content">
   {loading&&<p>Загружаем уведомления…</p>}
   {error&&<p role="alert">{error}</p>}
   {!loading&&!error&&!items.length&&<div className="empty empty-state native-zero-state"><Bell size={54} strokeWidth={1.4}/><h3>Пока нет уведомлений</h3><p>Здесь появятся сообщения SIZEY, предложения и уведомления о начислении бонусов.</p><button type="button" className="blackbtn" onClick={()=>window.location.reload()}>Обновить уведомления</button></div>}
   <div className="notification-inbox-list">{items.map(item=><button type="button" key={item.id} className={'notification-inbox-item'+(!item.read?' is-unread':'')} onClick={()=>void read(item)}><span className="notification-inbox-heading"><strong>{item.title}</strong>{!item.read&&<span className="notification-unread-dot"/>}</span><span>{item.message}</span><small>{new Date(item.created).toLocaleString('ru-RU',{dateStyle:'medium',timeStyle:'short'})}</small></button>)}</div>
   {items.length>0&&<p className="notification-inbox-hint"><CheckCheck size={15}/> Нажмите на уведомление, чтобы открыть</p>}
  </main>}
 </>;
}
