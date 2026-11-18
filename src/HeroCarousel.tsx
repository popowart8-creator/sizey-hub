import {useRef,useState} from 'react';
import {ArrowRight,Search} from 'lucide-react';
const slides=[
 {image:'/brand/857220148072.jpg',title:'Тепло. И красиво.',tone:'dark'},
 {image:'/brand/943151810212.jpg',title:'В твоём ритме.',tone:'light'},
 {image:'/brand/673427758392.jpg',title:'Новый сезон.',tone:'light'},
];
export default function HeroCarousel({onExplore,onSearch}:{onExplore:()=>void;onSearch:()=>void}){
 const [active,setActive]=useState(0);const track=useRef<HTMLDivElement>(null);
 const move=(index:number)=>track.current?.scrollTo({left:index*track.current.clientWidth,behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
 return <section className="home-intro" aria-label="Коллекции SIZEY"><div className={'editorial-hero tone-'+slides[active].tone}>
 <div className="carousel-track" ref={track} onScroll={e=>{const el=e.currentTarget;setActive(Math.max(0,Math.min(slides.length-1,Math.round(el.scrollLeft/el.clientWidth))))}} onKeyDown={e=>{if(e.key==='ArrowRight'){e.preventDefault();move(Math.min(active+1,slides.length-1))}if(e.key==='ArrowLeft'){e.preventDefault();move(Math.max(active-1,0))}}} tabIndex={0} role="region" aria-roledescription="карусель" aria-label="Подборки одежды">{slides.map((slide,i)=><article className={'carousel-slide tone-'+slide.tone} key={slide.image} aria-roledescription="слайд" aria-label={`${i+1} из ${slides.length}: ${slide.title}`}><img src={slide.image} alt={i===0?'Куртка и светлые брюки из коллекции SIZEY':i===1?'Светлый повседневный костюм SIZEY':'Пальто из коллекции SIZEY'} fetchPriority={i===0?'high':'auto'} draggable={false}/><div className="slide-gradient"/><div className="slide-title">{i===0?<h1>{slide.title}</h1>:<h2>{slide.title}</h2>}</div></article>)}</div>
 <div className="hero-top"><img className="hero-logo" src="/brand/logo.svg" alt="SIZEY"/><button className="round-search" aria-label="Поиск по каталогу" onClick={onSearch}><Search size={24} strokeWidth={1.7}/></button></div>
 <div className="carousel-dots" aria-label="Переключить подборку">{slides.map((slide,i)=><button key={slide.image} aria-label={`Подборка ${i+1}`} aria-current={active===i?'true':undefined} onClick={()=>move(i)}><span/></button>)}</div>
 </div><div className="hero-action"><button className="blackbtn" onClick={onExplore}>Смотреть коллекцию <ArrowRight size={22}/></button></div></section>
}
