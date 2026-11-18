import {useEffect,useRef,useState, type ReactNode} from 'react';
import {platform} from './Navigation';

type HapticActionProps={
 children:ReactNode;
 className:string;
 ariaLabel:string;
 onActivate:()=>void;
 disabled?:boolean;
 favorite?:boolean;
 selected?:boolean;
};

/** Native iOS switch keeps its tactile feedback; the favorite burst is a separate visual state. */
export default function HapticAction({children,className,ariaLabel,onActivate,disabled=false,favorite=false,selected=false}:HapticActionProps){
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
 if(platform()==='ios')return <label className={cls+' haptic-action'}>
  <span className="haptic-action-content" aria-hidden="true">{children}</span>
  <input type="checkbox" {...{switch:''}} className="haptic-action-switch" aria-label={ariaLabel} checked={checked} disabled={disabled} onChange={event=>{setChecked(event.currentTarget.checked);activate()}}/>
 </label>;
 return <button type="button" className={cls} aria-label={ariaLabel} disabled={disabled} onClick={activate}>{children}</button>;
}
