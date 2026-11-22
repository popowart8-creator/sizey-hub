import {useEffect,useState} from 'react';
import {House,Shirt,Heart,ShoppingBag,User} from 'lucide-react';
const tabs=[{id:'shop',label:'Главная',icon:House},{id:'catalog',label:'Каталог',icon:Shirt},{id:'cart',label:'Корзина',icon:ShoppingBag},{id:'favorites',label:'Избранное',icon:Heart},{id:'profile',label:'Профиль',icon:User}];
export const platform=()=>/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1)?'ios':/Android/.test(navigator.userAgent)?'android':'web';
function hapticTabChange(){if(!/Android/i.test(navigator.userAgent))return;try{navigator.vibrate?.(10)}catch{/* Haptics are optional and must never block navigation. */}}
export default function Navigation({page,count,favoritePulse,cartPulse,onNavigate}:{page:string;count:number;favoritePulse:number;cartPulse:number;onNavigate:(page:string)=>void}){
 const os=platform();
 const [pulsing,setPulsing]=useState(false);
 const [cartPulsing,setCartPulsing]=useState(false);
 useEffect(()=>{if(!cartPulse)return;setCartPulsing(false);const frame=requestAnimationFrame(()=>setCartPulsing(true));const timer=setTimeout(()=>setCartPulsing(false),850);return()=>{cancelAnimationFrame(frame);clearTimeout(timer)}},[cartPulse]);
 useEffect(()=>{if(!favoritePulse)return;setPulsing(false);const frame=requestAnimationFrame(()=>setPulsing(true));const timer=setTimeout(()=>setPulsing(false),900);return()=>{cancelAnimationFrame(frame);clearTimeout(timer)}},[favoritePulse]);
 return <nav className={'tabbar tabbar--'+os} aria-label="Основная навигация"><button type="button" className="desktop-brand" aria-label="SIZEY — главная" onClick={()=>onNavigate('shop')}><img src="/brand/logo.svg" alt=""/></button>{tabs.map(({id,label,icon:Icon})=>{
  const content=<><span className={"tab-icon"+(id==="favorites"&&pulsing?" tab-favorite-pulse":"")}><Icon size={25} strokeWidth={1.7} fill={id==="favorites"&&pulsing?"currentColor":"none"} aria-hidden="true"/>{id==='cart'&&count>0&&<span key={count} className={"tab-badge"+(cartPulsing?" tab-badge-pop":"")} aria-label={count+' товаров'}>{count>99?'99+':count}</span>}</span><span>{label}</span></>;
  const className='tab '+(page===id?'is-active':'');
  // Real finger contact with a native switch is required for the experimental iOS haptic.
  // Keep the input as the actual hit target; synthetic .click() does not trigger it.
  if(os==='ios')return <label key={id} className={className+' tab--ios-switch'}><span className="tab-visual" aria-hidden="true">{content}</span><input type="checkbox" {...{switch:""}} className="tab-haptic-switch" aria-label={label} aria-current={page===id?'page':undefined} onChange={()=>{if(page!==id)onNavigate(id)}}/></label>;
  return <button key={id} className={className} aria-current={page===id?'page':undefined} onClick={()=>{if(page!==id)hapticTabChange();onNavigate(id)}}>{content}</button>;
 })}</nav>
}
