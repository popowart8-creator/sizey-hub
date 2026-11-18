import type {ReactNode} from 'react';
import {platform} from './Navigation';
export default function HapticAction({children,className,ariaLabel,onActivate}:{children:ReactNode;className:string;ariaLabel:string;onActivate:()=>void}){
 if(platform()==='ios')return <label className={className+' haptic-action'}><span className="haptic-action-content" aria-hidden="true">{children}</span><input type="checkbox" {...{switch:''}} className="haptic-action-switch" aria-label={ariaLabel} onChange={onActivate}/></label>;
 return <button className={className} aria-label={ariaLabel} onClick={onActivate}>{children}</button>;
}
