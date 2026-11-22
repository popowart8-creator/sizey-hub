import {useEffect,useState} from 'react';
import {Wifi,WifiOff} from 'lucide-react';
import './NetworkToast.css';

// iOS installed PWAs do not reliably dispatch online/offline events.
export default function NetworkToast(){
 const [online,setOnline]=useState(navigator.onLine);
 const [visible,setVisible]=useState(!navigator.onLine);
 const [leaving,setLeaving]=useState(false);
 useEffect(()=>{
  let hideTimer:number|undefined;
  let exitTimer:number|undefined;
  let stopped=false;
  let checking=false;
  let lastKnown=navigator.onLine;
  const update=(connected:boolean)=>{
   if(stopped||connected===lastKnown)return;
   lastKnown=connected;
   window.clearTimeout(hideTimer);
   window.clearTimeout(exitTimer);
   setLeaving(false);
   setOnline(connected);
   setVisible(true);
   if(connected)hideTimer=window.setTimeout(()=>{setLeaving(true);exitTimer=window.setTimeout(()=>setVisible(false),320)},3500);
  };
  const check=async()=>{
   if(checking||stopped)return;
   if(!navigator.onLine){update(false);return}
   checking=true;
   const controller=new AbortController();
   const timeout=window.setTimeout(()=>controller.abort(),4500);
   try{
    // The SW deliberately bypasses /sw.js; a unique URL prevents HTTP cache hits.
    const response=await fetch('/sw.js?connection_probe='+Date.now(),{cache:'no-store',signal:controller.signal});
    update(response.ok&&(response.headers.get('content-type')||'').includes('javascript'));
   }catch{update(false)}
   finally{window.clearTimeout(timeout);checking=false}
  };
  const offline=()=>update(false);
  const restored=()=>void check();
  window.addEventListener('offline',offline);
  window.addEventListener('online',restored);
  document.addEventListener('visibilitychange',restored);
  void check();
  const interval=window.setInterval(()=>void check(),10000);
  return()=>{stopped=true;window.clearTimeout(hideTimer);window.clearTimeout(exitTimer);window.clearInterval(interval);window.removeEventListener('offline',offline);window.removeEventListener('online',restored);document.removeEventListener('visibilitychange',restored)};
 },[]);
 if(!visible)return null;
 return <div className={'network-toast '+(online?'network-toast--online':'network-toast--offline')+(leaving?' network-toast--leaving':'')} role="status" aria-live="polite">
  <span className="network-toast__icon">{online?<Wifi size={19} strokeWidth={2.6}/>:<WifiOff size={19} strokeWidth={2.6}/>}</span>
  <span>{online?'Интернет появился':'Нет интернета'}</span>
 </div>;
}
