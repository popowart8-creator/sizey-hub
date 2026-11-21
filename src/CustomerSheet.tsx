import {useEffect,useId,useRef,useState,type ReactNode} from 'react';
import {X} from 'lucide-react';
import {createPortal} from 'react-dom';

export default function CustomerSheet({title,closeLabel='Закрыть',children,onClose}:{
 title:string;closeLabel?:string;children:ReactNode;onClose:()=>void;
}){
 const titleId=useId();
 const closeButton=useRef<HTMLButtonElement>(null);
 const closeCallback=useRef(onClose);
 closeCallback.current=onClose;
 const touchStart=useRef<number|null>(null);
 const [entered,setEntered]=useState(false);
 const [closing,setClosing]=useState(false);
 const [drag,setDrag]=useState(0);

 function dismiss(){
  setDrag(0);
  setClosing(true);
 }

 useEffect(()=>{
  const previous=document.activeElement;
  const frame=requestAnimationFrame(()=>{
   setEntered(true);
   closeButton.current?.focus({preventScroll:true});
  });
  const escape=(event:KeyboardEvent)=>{if(event.key==='Escape')dismiss()};
  document.addEventListener('keydown',escape);
  return ()=>{
   cancelAnimationFrame(frame);
   document.removeEventListener('keydown',escape);
   if(previous instanceof HTMLElement&&previous.isConnected)previous.focus({preventScroll:true});
  };
 },[]);

 useEffect(()=>{
  if(!closing)return;
  const duration=window.matchMedia('(prefers-reduced-motion: reduce)').matches?0:260;
  const timer=window.setTimeout(()=>closeCallback.current(),duration);
  return()=>window.clearTimeout(timer);
 },[closing]);

 return createPortal(
  <div className={'delivery-swipe-overlay'+(entered&&!closing?' is-visible':'')+(closing?' is-closing':'')} onClick={dismiss}>
   <section className="delivery-swipe-sheet customer-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId}
    style={drag>0?{transform:`translateY(${drag}px)`,transition:'none'}:undefined}
    onClick={event=>event.stopPropagation()}
    onTouchStart={event=>{
     if(!closing&&event.touches.length===1&&!(event.target as Element).closest('.customer-sheet-body')){
      touchStart.current=event.touches[0].clientY;
     }
    }}
    onTouchMove={event=>{
     if(touchStart.current!==null&&event.touches.length===1)setDrag(Math.max(0,event.touches[0].clientY-touchStart.current));
    }}
    onTouchEnd={event=>{
     const start=touchStart.current;
     touchStart.current=null;
     if(start!==null&&event.changedTouches[0].clientY-start>90)dismiss();
     else setDrag(0);
    }}
    onTouchCancel={()=>{touchStart.current=null;setDrag(0)}}>
    <div className="delivery-swipe-handle" aria-hidden="true"/>
    <div className="customer-sheet-header">
     <h2 id={titleId}>{title}</h2>
     <button type="button" ref={closeButton} className="close" aria-label={closeLabel} onClick={dismiss}><X aria-hidden="true"/></button>
    </div>
    <div className="customer-sheet-body">{children}</div>
   </section>
  </div>,
  document.body
 );
}
