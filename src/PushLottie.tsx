import {useEffect,useRef,useState} from 'react';

type LottieAnimation={destroy:()=>void};
type LottiePlayer={loadAnimation:(options:{container:HTMLElement;renderer:'svg';loop:boolean;autoplay:boolean;path:string;rendererSettings:{preserveAspectRatio:string}})=>LottieAnimation};
declare global {interface Window {lottie?:LottiePlayer}}
let playerPromise:Promise<LottiePlayer>|undefined;
function loadPlayer():Promise<LottiePlayer>{
 if(window.lottie)return Promise.resolve(window.lottie);
 if(!playerPromise)playerPromise=new Promise<LottiePlayer>((resolve,reject)=>{
  const script=document.createElement('script');
  script.src='https://cdn.jsdelivr.net/npm/lottie-web@5.12.2/build/player/lottie_light.min.js';
  script.async=true;
  script.onload=()=>window.lottie?resolve(window.lottie):reject(new Error('Lottie unavailable'));
  script.onerror=()=>reject(new Error('Lottie script unavailable'));
  document.head.appendChild(script);
 }).catch(error=>{playerPromise=undefined;throw error});
 return playerPromise!;
}
export default function PushLottie(){
 const target=useRef<HTMLDivElement>(null);
 const [failed,setFailed]=useState(false);
 useEffect(()=>{
  let active=true;
  let animation:LottieAnimation|undefined;
  if(window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  loadPlayer().then(player=>{
   if(!active||!target.current)return;
   animation=player.loadAnimation({container:target.current,renderer:'svg',loop:true,autoplay:true,path:'/animations/sizey-notification-bell.json',rendererSettings:{preserveAspectRatio:'xMidYMid meet'}});
  }).catch(()=>{if(active)setFailed(true)});
  return()=>{active=false;animation?.destroy()};
 },[]);
 return <div className="push-lottie-art" aria-hidden="true">{!failed&&<div ref={target} className="push-lottie-art-player"/>}{failed&&<span className="push-lottie-fallback">🔔</span>}</div>;
}
