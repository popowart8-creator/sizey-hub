import {useEffect,useState} from 'react';
import {Bell} from 'lucide-react';

/** Always show a lightweight icon first; enhance only on capable devices. */
export default function PushArtwork(){
 const [enhanced,setEnhanced]=useState(false);
 useEffect(()=>{
  const connection=(navigator as Navigator&{connection?:{saveData?:boolean;effectiveType?:string}}).connection;
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const slow=connection?.saveData||connection?.effectiveType==='slow-2g'||connection?.effectiveType==='2g';
  const lowMemory=(navigator as Navigator&{deviceMemory?:number}).deviceMemory;
  if(reduced||slow||(lowMemory!==undefined&&lowMemory<=2))return;
  let cancelled=false;
  const timer=window.setTimeout(()=>{if(!cancelled)setEnhanced(true)},180);
  return()=>{cancelled=true;window.clearTimeout(timer)};
 },[]);
 return <div className={'push-artwork'+(enhanced?' push-artwork--enhanced':'')} aria-hidden="true">
  <div className="push-artwork-stage">
   <div className="push-artwork-halo"/>
   <div className="push-artwork-ring"/>
   <div className="push-artwork-bell"><Bell size={78} strokeWidth={1.55}/><span className="push-artwork-badge">3</span></div>
   <span className="push-artwork-glint push-artwork-glint--one"/>
   <span className="push-artwork-glint push-artwork-glint--two"/>
  </div>
 </div>;
}
