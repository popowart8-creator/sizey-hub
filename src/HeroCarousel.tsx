import {isStandalone} from './InstallPrompt';
import {useEffect,useRef,useState} from 'react';
import {ArrowRight,Search,Pause,Play} from 'lucide-react';
const slides=[
 {image:'/brand/857220148072.webp',title:'Тепло. И красиво.',tone:'dark'},
 {image:'/brand/943151810212.webp',title:'В твоём ритме.',tone:'light'},
 {image:'/brand/673427758392.webp',title:'Новый сезон.',tone:'light'},
];
export default function HeroCarousel({onExplore,onSearch,suspended=false}:{onExplore:()=>void;onSearch:()=>void;suspended?:boolean}){
 const [active,setActive]=useState(0),[paused,setPaused]=useState(()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches);const track=useRef<HTMLDivElement>(null);const touching=useRef(false);
 const move=(index:number)=>track.current?.scrollTo({left:index*track.current.clientWidth,behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
 useEffect(()=>{if(paused||suspended)return;const timer=setInterval(()=>{if(!document.hidden&&!touching.current)move((active+1)%slides.length)},5500);return()=>clearInterval(timer)},[active,paused,suspended]);
 useEffect(()=>{document.documentElement.dataset.heroTone=slides[active].tone;(!isStandalone()||!/iPhone|iPad|iPod/.test(navigator.userAgent))&&document.querySelector('meta[name=theme-color]')?.setAttribute('content',slides[active].tone==='dark'?'#292c30':'#d5d4d1');return()=>{delete document.documentElement.dataset.heroTone}},[active]);
 return <section className="home-intro" aria-label="Коллекции SIZEY"><div className={'editorial-hero tone-'+slides[active].tone}>
 <div className="carousel-track" ref={track} onPointerDown={()=>{touching.current=true}} onPointerUp={()=>{touching.current=false}} onPointerCancel={()=>{touching.current=false}} onTouchEnd={()=>{touching.current=false}} onScroll={e=>{const el=e.currentTarget;setActive(Math.max(0,Math.min(slides.length-1,Math.round(el.scrollLeft/el.clientWidth))))}} onKeyDown={e=>{if(e.key==='ArrowRight'){e.preventDefault();move(Math.min(active+1,slides.length-1))}if(e.key==='ArrowLeft'){e.preventDefault();move(Math.max(active-1,0))}}} tabIndex={0} role="region" aria-roledescription="карусель" aria-label="Подборки одежды">{slides.map((slide,i)=><article className={'carousel-slide tone-'+slide.tone} key={slide.image} aria-roledescription="слайд" aria-label={`${i+1} из ${slides.length}: ${slide.title}`}><img src={slide.image} alt={i===0?'Куртка и светлые брюки SIZEY':i===1?'Светлый костюм SIZEY':'Пальто SIZEY'} fetchPriority={i===0?'high':'low'} loading={i===0?'eager':'lazy'} decoding="async" draggable={false}/><div className="slide-gradient"/><div className="slide-title">{i===0?<h1>{slide.title}</h1>:<h2>{slide.title}</h2>}</div></article>)}</div>
 <div className="hero-top"><img className="hero-logo" src="/brand/logo.svg" alt="SIZEY"/><button className="round-search" aria-label="Поиск по каталогу" onClick={onSearch}><Search size={24} strokeWidth={1.7}/></button></div>
 <div className="hero-bottom-content"><button className="whitebtn" onClick={onExplore}>Смотреть коллекцию <ArrowRight size={22}/></button><div className="carousel-controls"><div className="carousel-dots" aria-label="Переключить подборку">{slides.map((slide,i)=><button key={slide.image} aria-label={`Подборка ${i+1}`} aria-current={active===i?'true':undefined} onClick={()=>move(i)}><span/></button>)}</div><button className="carousel-pause" aria-label={paused?'Включить автопереключение':'Остановить автопереключение'} onClick={()=>setPaused(v=>!v)}>{paused?<Play size={16}/>:<Pause size={16}/>}</button></div></div>
 </div></section>
}
