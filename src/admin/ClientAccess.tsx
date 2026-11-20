import {useEffect,useRef,useState,type FormEvent} from 'react';

type Access={hasPassword:boolean;canConfirm:boolean;phone:string;phoneVerified:boolean;mustChangePassword:boolean;temporaryPasswordPending:boolean};
type Issued={phone:string;temporaryPassword:string};

async function request<T>(clientId:string,confirmation?:{identityChecked:boolean;expectedPhone:string;verificationCode?:string},signal?:AbortSignal):Promise<T>{
 const response=await fetch('/hub-api/admin/clients/'+encodeURIComponent(clientId)+'/access',{
  credentials:'same-origin',cache:'no-store',signal,
  ...(confirmation?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(confirmation)}:{})
 });
 const data=await response.json();
 if(!response.ok)throw Object.assign(new Error(data.message||'Не удалось проверить доступ клиента'),{status:response.status});
 return data;
}

export default function ClientAccess({clientId,onExpired}:{clientId:string;onExpired:()=>void}){
 const [access,setAccess]=useState<Access|null>(null);
 const [issued,setIssued]=useState<Issued|null>(null);
 const [confirming,setConfirming]=useState(false);
 const [confirmed,setConfirmed]=useState(false);
 const [code,setCode]=useState('');
 const confirmingExisting=access?.canConfirm===true;
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [revision,setRevision]=useState(0);
 const expired=useRef(onExpired);
 expired.current=onExpired;

 useEffect(()=>{
  const controller=new AbortController();
  request<Access>(clientId,undefined,controller.signal).then(setAccess).catch(error=>{
   if(controller.signal.aborted)return;
   if(error.status===401)expired.current();
   setError(error.message);
  });
  return()=>controller.abort();
 },[clientId,revision]);

 useEffect(()=>{
  if(!issued)return;
  const timer=window.setTimeout(()=>setIssued(null),60000);
  return()=>window.clearTimeout(timer);
 },[issued]);

 async function issue(event:FormEvent){
  event.preventDefault();
  if(!access||!confirmed||busy)return;
  setBusy(true);
  setError('');
  try{
   const result=await request<Issued|{phoneVerified:true}>(clientId,{
    identityChecked:true,expectedPhone:access.phone,...(confirmingExisting?{verificationCode:code}:{})
   });
   if('temporaryPassword' in result)setIssued(result);
   setCode('');
   setConfirming(false);
   setConfirmed(false);
   setRevision(value=>value+1);
  }catch(error){
   if((error as {status?:number}).status===401)expired.current();
   setError((error as Error).message);
  }finally{setBusy(false)}
 }

 return <section aria-label="Доступ в SIZEY">
  <h3>Доступ в SIZEY</h3>
  {error&&<div className="notice error" role="alert">{error}</div>}
  {access?<p className="clients-muted">{access.temporaryPasswordPending?'Временный пароль готов к выдаче':access.mustChangePassword?'Ожидается смена временного пароля':access.phoneVerified?'Номер подтверждён':'Номер для бонусов ещё не подтверждён'}</p>
   :error?<button type="button" className="secondary" onClick={()=>{setError('');setRevision(value=>value+1)}}>Повторить проверку</button>
   :<p role="status">Проверяем доступ…</p>}
  {issued?<div className="notice" role="status">
   <p>Временный пароль для {issued.phone}</p>
   <code>{issued.temporaryPassword}</code>
   <p>При входе клиенту потребуется задать новый пароль.</p>
   <button type="button" className="secondary" onClick={()=>setIssued(null)}>Скрыть пароль</button>
  </div>:confirming&&access?<form onSubmit={issue}>
   <p>Номер клиента: <strong>{access.phone}</strong></p>
   {confirmingExisting?<p><label>Код из профиля клиента <input value={code} inputMode="numeric" pattern="[0-9]{8}" maxLength={8} required onChange={event=>setCode(event.target.value)}/></label></p>:<p>Предыдущий пароль перестанет действовать, активные сеансы завершатся.</p>}
   <p><label><input type="checkbox" checked={confirmed} required disabled={busy} onChange={event=>setConfirmed(event.target.checked)}/> Я проверил личность клиента и принадлежность номера телефона.</label></p>
   <button className="primary" disabled={!confirmed||busy||(confirmingExisting&&!/^\d{8}$/.test(code))}>{busy?'Сохраняем…':confirmingExisting?'Подтвердить номер':'Выдать временный пароль'}</button>
   <button type="button" className="secondary" disabled={busy} onClick={()=>{setConfirming(false);setConfirmed(false);setCode('');setError('')}}>Отмена</button>
  </form>:access&&<button type="button" className="secondary" onClick={()=>setConfirming(true)}>
   {confirmingExisting?'Подтвердить номер':!access.hasPassword||access.temporaryPasswordPending?'Выдать временный пароль':'Сбросить пароль'}
  </button>}
 </section>;
}
