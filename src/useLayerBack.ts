import {useEffect,useRef} from 'react';
export default function useLayerBack(active:boolean,key:string,onClose:()=>void,handleEscape=true){
 const close=useRef(onClose);close.current=onClose;
 const escapeEnabled=useRef(handleEscape);escapeEnabled.current=handleEscape;
 useEffect(()=>{if(!active)return;const id=key+'-'+Date.now();history.pushState({...history.state,sizeyLayer:id},'');const back=()=>{if(history.state?.sizeyLayer!==id)close.current()};const escape=(event:KeyboardEvent)=>{if(escapeEnabled.current&&event.key==='Escape'&&history.state?.sizeyLayer===id){event.preventDefault();close.current()}};window.addEventListener('popstate',back);window.addEventListener('keydown',escape);return()=>{window.removeEventListener('popstate',back);window.removeEventListener('keydown',escape);if(history.state?.sizeyLayer===id)history.back()}},[active,key]);
}
