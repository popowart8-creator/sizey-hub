import {useEffect,useState} from 'react';

// Keep already decoded images visible immediately when switching tabs and remounting cards.
const loadedImages=new Set<string>();
// Retain decoded image elements across route changes, including admin-uploaded URLs.
const decodedImages=new Map<string,HTMLImageElement>();
const rememberImage=(url:string)=>{if(decodedImages.has(url))return;const image=new Image();image.src=url;decodedImages.set(url,image);if(decodedImages.size>160){const oldest=decodedImages.keys().next().value;if(oldest)decodedImages.delete(oldest)}};
const imageCache='sizey-media-v2';
const sameOrigin=(url:string)=>{try{return new URL(url,location.href).origin===location.origin}catch{return false}};
export default function ProductImage({src,alt,className,width,height,loading}:{src:string;alt:string;className?:string;width?:number;height?:number;loading?:'lazy'|'eager'}){
 const adminImage=!src.startsWith('/brand/');
 const [current,setCurrent]=useState(src);
 const [status,setStatus]=useState<'loading'|'ready'|'error'>(()=>loadedImages.has(src)?'ready':'loading');
 useEffect(()=>{setCurrent(src);setStatus(loadedImages.has(src)?'ready':'loading')},[src]);
 useEffect(()=>{
  if(navigator.onLine||!('caches' in window)||!sameOrigin(src))return;
  let active=true;let objectUrl:string|undefined;
  (async()=>{for(const url of [src,src.replace('-360.webp','.webp')]){
   try{const saved=await caches.match(url);if(!saved||!saved.ok)continue;
    const blob=await saved.blob();if(!active)return;
    objectUrl=URL.createObjectURL(blob);setCurrent(objectUrl);return;
   }catch{}
  }})();
  return()=>{active=false;if(objectUrl)URL.revokeObjectURL(objectUrl)};
 },[src]);
 const persist=(url:string)=>{
  if(!sameOrigin(url)||!('caches' in window)||url.startsWith('blob:'))return;
  void (async()=>{try{
   const cache=await caches.open(imageCache);
   if(await cache.match(url))return;
   const response=await fetch(url,{cache:'force-cache'});
   if(response.ok&&response.type!=='opaque'&&(response.headers.get('content-type')||'').startsWith('image/'))await cache.put(url,response);
  }catch{}})();
 };
 useEffect(()=>{if(status!=='loading')return;const timeout=setTimeout(()=>setStatus('error'),navigator.onLine?12000:2500);return()=>clearTimeout(timeout)},[current,status]);
 const failed=()=>{
  if(current.includes('-360.webp')){setCurrent(current.replace('-360.webp','.webp'));setStatus('loading');return}
  setStatus('error');
 };
 return <span className={'image-loading-wrap '+(className==='detailphoto'?'image-loading-detail':'')+(status==='loading'?' is-loading':'')+(status==='error'?' image-unavailable':'')}>
  {status==='loading'&&!adminImage&&<span className="shimmer image-loading-shimmer" aria-hidden="true"/>}
  {status==='error'&&<span className="image-unavailable-label" role="img" aria-label="Фото недоступно">Фото недоступно</span>}
  <img className={className} src={current} alt={alt} width={width} height={height} loading={loading||'lazy'} decoding="async" onLoad={()=>{loadedImages.add(src);rememberImage(src);setStatus('ready');persist(src)}} onError={failed} style={{opacity:adminImage||status==='ready'?1:0}}/>
 </span>;
}
