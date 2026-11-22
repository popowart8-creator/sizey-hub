import {useEffect,useState} from 'react';
import {Wifi,WifiOff} from 'lucide-react';
import './NetworkToast.css';

export default function NetworkToast(){
 const [online,setOnline]=useState(navigator.onLine);
 const [visible,setVisible]=useState(!navigator.onLine);
 useEffect(()=>{
  let timer:number|undefined;
  const offline=()=>{window.clearTimeout(timer);setOnline(false);setVisible(true)};
  const restored=()=>{window.clearTimeout(timer);setOnline(true);setVisible(true);timer=window.setTimeout(()=>setVisible(false),3500)};
  window.addEventListener('offline',offline);
  window.addEventListener('online',restored);
  return()=>{window.clearTimeout(timer);window.removeEventListener('offline',offline);window.removeEventListener('online',restored)};
 },[]);
 if(!visible)return null;
 return <div className={'network-toast '+(online?'network-toast--online':'network-toast--offline')} role="status" aria-live="polite">
  <span className="network-toast__icon">{online?<Wifi size={19} strokeWidth={2.6}/>:<WifiOff size={19} strokeWidth={2.6}/>}</span>
  <span>{online?'Интернет появился':'Нет интернета'}</span>
 </div>;
}
