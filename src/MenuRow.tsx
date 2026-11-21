import type {ReactNode} from 'react';
import {ChevronRight} from 'lucide-react';

export default function MenuRow({children,icon,onClick,disabled=false,className='',chevron=true,opensDialog=false}:{
 children:ReactNode;icon?:ReactNode;onClick:()=>void;disabled?:boolean;className?:string;chevron?:boolean;opensDialog?:boolean;
}){
 return <button type="button" className={`profilerow menu-row ${className}`} aria-haspopup={opensDialog?'dialog':undefined} onClick={onClick} disabled={disabled}>
  {icon}<span>{children}</span>{chevron&&<ChevronRight className="menu-row-chevron" size={20} aria-hidden="true"/>}
 </button>;
}
