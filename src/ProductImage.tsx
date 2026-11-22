import {useEffect,useState} from 'react';
export default function ProductImage({src,alt,className,width,height,loading}:{src:string;alt:string;className?:string;width?:number;height?:number;loading?:'lazy'|'eager'}){
 const [current,setCurrent]=useState(src);
 const [status,setStatus]=useState<'loading'|'ready'|'error'>('loading');
 useEffect(()=>{setCurrent(src);setStatus('loading')},[src]);
 const failed=()=>{
  if(current.includes('-360.webp')){setCurrent(current.replace('-360.webp','.webp'));setStatus('loading');return}
  setStatus('error');
 };
 return <span className={'image-loading-wrap '+(className==='detailphoto'?'image-loading-detail':'')+(status==='loading'?' is-loading':'')+(status==='error'?' image-unavailable':'')}>
  {status==='loading'&&<span className="shimmer image-loading-shimmer" aria-hidden="true"/>}
  {status==='error'&&<span className="image-unavailable-label" role="img" aria-label="Фото недоступно">Фото недоступно</span>}
  <img className={className} src={current} alt={alt} width={width} height={height} loading={loading||'lazy'} decoding="async" onLoad={()=>setStatus('ready')} onError={failed} style={{opacity:status==='ready'?1:0}}/>
 </span>;
}
