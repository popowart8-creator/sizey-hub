import {ArrowLeft} from 'lucide-react';

export default function PageHeader({title,onBack}:{title:string;onBack?:()=>void}){
 return <div className="page-top">
  {onBack&&<button type="button" className="icon-control" aria-label="Назад в профиль" onClick={onBack}><ArrowLeft aria-hidden="true"/></button>}
  <h1>{title}</h1>
 </div>;
}
