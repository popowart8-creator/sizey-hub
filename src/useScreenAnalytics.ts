import {useEffect} from 'react';
import {track,setScreenContext,flushAnalytics} from './analytics';
export default function useScreenAnalytics(screen:string,identity:string|number=''){
 useEffect(()=>{
  if(!crypto.randomUUID)return;const viewId=crypto.randomUUID();setScreenContext(screen,viewId);track('screen_view',{screen,viewId});
  let last=performance.now(),interaction=last,active=0,visible=document.visibilityState!=='hidden',focused=document.hasFocus();const depths=new Set<number>();
  const account=()=>{const now=performance.now();if(visible&&focused)active+=Math.max(0,Math.min(now,interaction+60000)-last);last=now};
  const send=()=>{account();const ms=Math.min(60000,Math.floor(active));if(ms>0){track('engagement',{screen,viewId,activeMs:ms});active-=ms}};
  const touch=()=>{account();interaction=performance.now()};
  const scroll=(event:Event)=>{touch();const el=event.target instanceof HTMLElement?event.target:document.scrollingElement;if(!el)return;
   const root=document.querySelector(screen==='product'?'.product-screen':screen==='search'?'.search-screen':screen==='password_change'?'.password-screen':screen==='install'?'.install-modal':screen==='checkout'||screen==='order_confirmation'||screen==='filters'||screen==='support'||screen==='delivery'?'.overlay':'.tab-screen');
   if(root&&el!==root&&!root.contains(el))return;const distance=el.scrollHeight-el.clientHeight;if(distance<20)return;const depth=Math.min(100,Math.max(0,el.scrollTop/distance*100));for(const value of[25,50,75,100])if(depth>=value&&!depths.has(value)){depths.add(value);track('scroll_depth',{screen,viewId,depth:value})}
  };
  const visibility=()=>{send();flushAnalytics();visible=document.visibilityState!=='hidden';last=performance.now();if(visible)interaction=last};const blur=()=>{send();focused=false};const focus=()=>{focused=true;last=performance.now();interaction=last};
  const leave=()=>{send();flushAnalytics()};const interval=setInterval(send,15000);document.addEventListener('scroll',scroll,true);document.addEventListener('pointerdown',touch,true);document.addEventListener('keydown',touch,true);document.addEventListener('visibilitychange',visibility);window.addEventListener('pagehide',leave);window.addEventListener('blur',blur);window.addEventListener('focus',focus);
  return()=>{send();clearInterval(interval);document.removeEventListener('scroll',scroll,true);document.removeEventListener('pointerdown',touch,true);document.removeEventListener('keydown',touch,true);document.removeEventListener('visibilitychange',visibility);window.removeEventListener('pagehide',leave);window.removeEventListener('blur',blur);window.removeEventListener('focus',focus)};
 },[screen,identity]);
}
