import {House,Shirt,Heart,ShoppingBag,User} from 'lucide-react';
const tabs=[{id:'shop',label:'Главная',icon:House},{id:'catalog',label:'Каталог',icon:Shirt},{id:'cart',label:'Корзина',icon:ShoppingBag},{id:'favorites',label:'Избранное',icon:Heart},{id:'profile',label:'Профиль',icon:User}];
export const platform=()=>/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1)?'ios':/Android/.test(navigator.userAgent)?'android':'web';
function hapticTabChange(){if(!/Android/i.test(navigator.userAgent))return;try{navigator.vibrate?.(10)}catch{/* Haptics are optional and must never block navigation. */}}
export default function Navigation({page,count,onNavigate}:{page:string;count:number;onNavigate:(page:string)=>void}){
 return <nav className={'tabbar tabbar--'+platform()} aria-label="Основная навигация">{tabs.map(({id,label,icon:Icon})=><button key={id} className={'tab '+(page===id?'is-active':'')} aria-current={page===id?'page':undefined} onClick={()=>{if(page!==id){hapticTabChange()}onNavigate(id)}}><span className="tab-icon">{Icon?<Icon size={25} strokeWidth={1.7} aria-hidden="true"/>:<span className="brand-mark" aria-hidden="true"/>}{id==='cart'&&count>0&&<span className="tab-badge" aria-label={count+' товаров'}>{count>99?'99+':count}</span>}</span><span>{label}</span></button>)}</nav>
}
