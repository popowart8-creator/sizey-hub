import {ChevronLeft,ChevronRight} from 'lucide-react';
import {isStandalone} from './displayMode';
import {useEffect,useRef,useState} from 'react';

const defaultSlides=[
 {image:'/brand/857220148072.webp',title:'Тепло. И красиво.',tone:'dark',category:'Все'},
 {image:'/brand/943151810212.webp',title:'В твоём ритме.',tone:'light',category:'Все'},
 {image:'/brand/673427758392.webp',title:'Новый сезон.',tone:'light',category:'Все'},
];
export default function HeroCarousel({onExplore,onSearch,suspended=false,banners}:{onExplore:(category?:string)=>void;onSearch:()=>void;suspended?:boolean;banners?:{image:string;title:string;tone:string;category?:string}[]}){
 const slides=banners??defaultSlides;
 const hero=useRef<HTMLElement>(null);
 const [active,setActive]=useState(0),[paused]=useState(()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches);const track=useRef<HTMLDivElement>(null);const touching=useRef(false);
 const move=(index:number)=>track.current?.scrollTo({left:index*track.current.clientWidth,behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
 useEffect(()=>{if(paused||suspended||slides.length<2)return;const timer=setInterval(()=>{if(!document.hidden&&!touching.current&&!hero.current?.closest('[data-pulling]'))move((active+1)%slides.length)},5500);return()=>clearInterval(timer)},[active,paused,suspended,slides.length]);
 useEffect(()=>{if(!slides.length)return;document.documentElement.dataset.heroTone=slides[Math.min(active,slides.length-1)].tone;(!isStandalone()||!/iPhone|iPad|iPod/.test(navigator.userAgent))&&document.querySelector('meta[name=theme-color]')?.setAttribute('content',slides[Math.min(active,slides.length-1)].tone==='dark'?'#292c30':'#d5d4d1');return()=>{delete document.documentElement.dataset.heroTone}},[active,slides]);
 useEffect(()=>{if(active>=slides.length)setActive(0)},[slides.length,active]);
 useEffect(()=>{
  const screen=hero.current?.closest<HTMLElement>('.tab-screen');
  const image=track.current?.querySelector('img');
  if(!screen||!image||suspended||paused)return;
  const baseImage=image;
  const element=screen;
  let gesture:{id:number;x:number;y:number;dragging:boolean}|undefined;

  function start(event:TouchEvent){
   const touch=event.touches[0];
   if(event.touches.length!==1||window.scrollY>0||element.scrollTop>0){
    reset();
    return;
   }
   gesture={id:touch.identifier,x:touch.clientX,y:touch.clientY,dragging:false};
  }

  function drag(event:TouchEvent){
   if(!gesture||event.touches.length!==1||!event.cancelable)return;
   const touch=event.touches[0];
   if(touch.identifier!==gesture.id)return;
   const distance=touch.clientY-gesture.y;
   if(!gesture.dragging){
    const sideways=Math.abs(touch.clientX-gesture.x);
    if(Math.max(Math.abs(distance),sideways)<6)return;
    if(distance<=sideways){
     gesture=undefined;
     return;
    }
    gesture.dragging=true;
    element.setAttribute('data-pulling','');
   }
   event.preventDefault();
   const distancePastTop=Math.max(0,distance);
   const pull=140*distancePastTop/(distancePastTop+240);
   const imageHeight=baseImage.offsetHeight;
   element.style.setProperty('--hero-pull',`${pull}px`);
   element.style.setProperty('--hero-scale',String(imageHeight ? 1+pull/imageHeight : 1));
  }

  function reset(){
   gesture=undefined;
   element.removeAttribute('data-pulling');
   element.style.removeProperty('--hero-pull');
   element.style.removeProperty('--hero-scale');
  }

  element.addEventListener('touchstart',start,{passive:true});
  element.addEventListener('touchmove',drag,{passive:false});
  element.addEventListener('touchend',reset);
  element.addEventListener('touchcancel',reset);
  return ()=>{
   reset();
   element.removeEventListener('touchstart',start);
   element.removeEventListener('touchmove',drag);
   element.removeEventListener('touchend',reset);
   element.removeEventListener('touchcancel',reset);
  };
 },[paused,suspended,slides.length>0]);
 if(!slides.length)return null;
 return <section ref={hero} className="home-intro" aria-label="Коллекции SIZEY"><div className={'editorial-hero tone-'+slides[Math.min(active,slides.length-1)].tone}>
 <div className="carousel-art"><div className="carousel-track" ref={track} onPointerDown={()=>{touching.current=true}} onPointerUp={()=>{touching.current=false}} onPointerCancel={()=>{touching.current=false}} onTouchEnd={()=>{touching.current=false}} onScroll={e=>{const el=e.currentTarget;setActive(Math.max(0,Math.min(slides.length-1,Math.round(el.scrollLeft/el.clientWidth))))}} onKeyDown={e=>{if(e.key==='ArrowRight'){e.preventDefault();move(Math.min(active+1,slides.length-1))}if(e.key==='ArrowLeft'){e.preventDefault();move(Math.max(active-1,0))}}} tabIndex={0} role="region" aria-roledescription="карусель" aria-label="Подборки одежды">{slides.map((slide,i)=><article className={'carousel-slide tone-'+slide.tone} key={slide.image} aria-roledescription="слайд" aria-label={`${i+1} из ${slides.length}: ${slide.title}`}><img src={slide.image} alt={slide.title} fetchPriority={i===0?'high':'low'} loading={i===0?'eager':'lazy'} decoding="async" draggable={false}/><button className="hero-slide-link" onClick={()=>onExplore(slide.category)} aria-label={`Открыть подборку: ${slide.title}`}/></article>)}</div></div>
 
 {slides.length>1&&<div className="hero-arrows">
  <button type="button" aria-label="Предыдущий баннер" onClick={()=>move((active+slides.length-1)%slides.length)}><ChevronLeft size={16} aria-hidden="true"/></button>
  <button type="button" aria-label="Следующий баннер" onClick={()=>move((active+1)%slides.length)}><ChevronRight size={16} aria-hidden="true"/></button>
 </div>}
 <div className="hero-bottom-content"><div className="carousel-controls"><div className="carousel-dots" aria-label="Переключить подборку">{slides.map((slide,i)=><button key={slide.image} aria-label={`Подборка ${i+1}`} aria-current={active===i?'true':undefined} onClick={()=>move(i)}><span/></button>)}</div></div></div>
 </div></section>
}
