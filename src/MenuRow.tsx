import type {ReactNode} from 'react';
import {ChevronRight} from 'lucide-react';

export default function MenuRow({children,icon,onClick,disabled=false,className='',chevron=true}:{
 children:ReactNode;icon?:ReactNode;onClick:()=>void;disabled?:boolean;className?:string;chevron?:boolean;
}){
 return <button type="button" className={`profilerow menu-row ${className}`} onClick={onClick} disabled={disabled}>
  {icon}<span>{children}</span>{chevron&&<ChevronRight size={20} aria-hidden="true"/>}
 </button>;
}
