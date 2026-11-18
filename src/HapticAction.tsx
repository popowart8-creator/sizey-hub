import {useEffect,useRef,useState, type ReactNode,type PointerEvent,type MouseEvent} from 'react';
import {platform} from './Navigation';

type HapticActionProps={
 children:ReactNode;
 className:string;
 ariaLabel:string;
 onActivate:()=>void;
 disabled?:boolean;
 favorite?:boolean;
 selected?:boolean;
 guardTap?:boolean;
};

/** Native iOS switch keeps its tactile feedback; the favorite burst is a separate visual state. */
export default function HapticAction({children,className,ariaLabel,onActivate,disabled=false,favorite=false,selected=false,guardTap=false}:HapticActionProps){
 const touch=useRef<{x:number;y:number;cancelled:boolean}|null>(null);
 const tapGuard=guardTap?{onPointerDownCapture:(event:PointerEvent)=>{touch.current={x:event.clientX,y:event.clientY,cancelled:false}},onPointerMoveCapture:(event:PointerEvent)=>{if(touch.current&&Math.hypot(event.clientX-touch.current.x,event.clientY-touch.current.y)>10)touch.current.cancelled=true},onPointerCancel:()=>{if(touch.current)touch.current.cancelled=true},onClickCapture:(event:MouseEvent)=>{if(event.detail===0){touch.current=null;return}if(touch.current?.cancelled){event.preventDefault();event.stopPropagation()}}}:{};
 const [checked,setChecked]=useState(false);
 const [burst,setBurst]=useState(false);
 const timer=useRef<ReturnType<typeof setTimeout>|null>(null);
 useEffect(()=>()=>{if(timer.current)clearTimeout(timer.current)},[]);
 const activate=()=>{
  if(favorite&&!selected){
   if(timer.current)clearTimeout(timer.current);
   setBurst(false);
   requestAnimationFrame(()=>requestAnimationFrame(()=>setBurst(true)));
   timer.current=setTimeout(()=>setBurst(false),800);
  }
  onActivate();
 };
 const cls=className+(favorite?' favorite-control':'')+(burst?' favorite-burst':'');
 if(platform()==='ios')return <label {...tapGuard} className={cls+' haptic-action'}>
  <span className="haptic-action-content" aria-hidden="true">{children}</span>
  <input type="checkbox" {...{switch:''}} className="haptic-action-switch" style={guardTap?{touchAction:'pan-y'}:undefined} aria-label={ariaLabel} checked={checked} disabled={disabled} onChange={event=>{if(guardTap&&touch.current?.cancelled)return;setChecked(event.currentTarget.checked);activate()}}/>
 </label>;
 return <button {...tapGuard} type="button" className={cls} aria-label={ariaLabel} disabled={disabled} onClick={activate}>{children}</button>;
}
