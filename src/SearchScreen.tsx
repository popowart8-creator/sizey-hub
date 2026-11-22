import ProductCard from './ProductCard';
import {track} from './analytics';
import {useState,useEffect,useRef} from 'react';
import {ArrowLeft,X} from 'lucide-react';
type Item={id:number;name:string;cat:string;price:number;img:string;tag?:string};
export default function SearchScreen({inactive=false,products,favorites,onClose,onSelect,onFavorite}:{inactive?:boolean;products:Item[];favorites:number[];onClose:()=>void;onSelect:(id:number)=>void;onFavorite:(id:number)=>void}){
 const [query,setQuery]=useState('');const results=products.filter(p=>(p.name+' '+p.cat).toLocaleLowerCase('ru').includes(query.trim().toLocaleLowerCase('ru')));
 const recorded=useRef('');useEffect(()=>{const text=query.trim();if(text.length<2)return;const timer=setTimeout(()=>{if(recorded.current!==text){recorded.current=text;track('search',{results:results.length})}},1000);return()=>clearTimeout(timer)},[query,results.length]);
 return <section className="search-screen" inert={inactive} role="dialog" aria-modal={!inactive} aria-label="Поиск" onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();onClose()}}}><div className="search-top"><button className="icon-control" aria-label="Назад из поиска" onClick={onClose}><ArrowLeft/></button><div className="search-field"><input autoFocus type="search" aria-label="Поиск товаров" placeholder="Что ищем?" value={query} onChange={e=>setQuery(e.target.value)}/>{query&&<button className="icon-control" aria-label="Очистить поиск" onClick={()=>setQuery('')}><X size={20}/></button>}</div></div><div className="search-results"><h1>{query?`Найдено: ${results.length}`:'Найди своё'}</h1><div className="productgrid">{results.map(p=><ProductCard key={p.id} product={p} favorite={favorites.includes(p.id)} onOpen={()=>onSelect(p.id)} onFavorite={()=>onFavorite(p.id)}/>)}</div>{!results.length&&<p className="empty">Ничего не найдено. Попробуй другое название.</p>}</div></section>
}
