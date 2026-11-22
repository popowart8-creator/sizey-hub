import {useEffect,useState} from 'react';
export default function ProductImage({src,alt,className,width,height,loading}:{src:string;alt:string;className?:string;width?:number;height?:number;loading?:'lazy'|'eager'}){
 const [current,setCurrent]=useState(src);
 const [status,setStatus]=useState<'loading'|'ready'|'error'>('loading');
 useEffect(()=>{setCurrent(src);setStatus('loading')},[src]);
 // Read cached media directly on iOS when the service worker has not yet taken control.
 useEffect(()=>{if(!('caches' in window))return;let active=true;let objectUrl:string|undefined;(async()=>{for(const url of [src,src.replace('-360.webp','.webp')]){try{const saved=await caches.match(url);if(!saved||!saved.ok)continue;const blob=await saved.blob();if(!active)return;objectUrl=URL.createObjectURL(blob);setCurrent(objectUrl);return}catch{}}})();return()=>{active=false;if(objectUrl)URL.revokeObjectURL(objectUrl)}},[src]);
 // Persist newly viewed images even when a previous service worker is not controlling this page.
 const persist=()=>{if(!current.startsWith('/brand/')||!('caches' in window))return;void (async()=>{try{const cache=await caches.open('sizey-media-v2');if(await cache.match(current))return;const response=await fetch(current,{cache:'force-cache'});if(response.ok&&(response.headers.get('content-type')||'').startsWith('image/'))await cache.put(current,response)}catch{}})()};
 // Offline WebKit may leave image requests pending forever without firing onError.
 useEffect(()=>{if(status!=='loading')return;const timeout=setTimeout(()=>setStatus('error'),navigator.onLine?12000:2500);return()=>clearTimeout(timeout)},[current,status]);
 const failed=()=>{
  if(current.includes('-360.webp')){setCurrent(current.replace('-360.webp','.webp'));setStatus('loading');return}
  setStatus('error');
 };
 return <span className={'image-loading-wrap '+(className==='detailphoto'?'image-loading-detail':'')+(status==='loading'?' is-loading':'')+(status==='error'?' image-unavailable':'')}>
  {status==='loading'&&<span className="shimmer image-loading-shimmer" aria-hidden="true"/>}
  {status==='error'&&<span className="image-unavailable-label" role="img" aria-label="Фото недоступно">Фото недоступно</span>}
  <img className={className} src={current} alt={alt} width={width} height={height} loading={loading||'lazy'} decoding="async" onLoad={()=>{setStatus('ready');persist()}} onError={failed} style={{opacity:status==='ready'?1:0}}/>
 </span>;
}
