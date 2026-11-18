import {useState, type ReactNode} from 'react';
import {platform} from './Navigation';

type HapticActionProps={
 children:ReactNode;
 className:string;
 ariaLabel:string;
 onActivate:()=>void;
 disabled?:boolean;
};

/** On iOS, a real finger press on the native switch produces the system haptic. */
export default function HapticAction({children,className,ariaLabel,onActivate,disabled=false}:HapticActionProps){
 const [checked,setChecked]=useState(false);
 if(platform()==='ios')return <label className={className+' haptic-action'}>
  <span className="haptic-action-content" aria-hidden="true">{children}</span>
  <input type="checkbox" {...{switch:''}} className="haptic-action-switch" aria-label={ariaLabel} checked={checked} disabled={disabled} onChange={event=>{setChecked(event.currentTarget.checked);onActivate()}}/>
 </label>;
 return <button type="button" className={className} aria-label={ariaLabel} disabled={disabled} onClick={onActivate}>{children}</button>;
}
