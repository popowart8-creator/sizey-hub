import {useEffect,useState,type FormEvent} from 'react';

import type {PushCounts} from './analytics-types';
type Campaign=PushCounts&{id:string;title:string;created:number};
type Status={subscribers:number;campaigns:Campaign[]};
const formatDate=new Intl.DateTimeFormat('ru-RU',{dateStyle:'short',timeStyle:'short',timeZone:'Europe/Moscow'});

export default function PushPanel({request,onError}:{request:<T>(path:string,data?:unknown)=>Promise<T>;onError:(error:unknown)=>void}){
 const [status,setStatus]=useState<Status>();
 const [title,setTitle]=useState('');
 const [message,setMessage]=useState('');
 const [path,setPath]=useState('/');
 const [customPath,setCustomPath]=useState('');
 const destination=path==='custom'?customPath.trim():path;
 const validDestination=destination.startsWith('/')&&!destination.startsWith('//')&&!destination.includes('\\')&&!/[\u0000-\u001f]/.test(destination);
 const [confirmed,setConfirmed]=useState(false);
 const [id,setId]=useState('');
 const [sending,setSending]=useState(false);
 const [error,setError]=useState('');
 const [result,setResult]=useState('');

 function reportError(reason:unknown){
  if((reason as {status?:number}).status===401)onError(reason);
  else setError(reason instanceof Error?reason.message:'Сервис уведомлений временно недоступен');
 }
 async function refresh(){
  try{setStatus(await request<Status>('/push'));setError('')}
  catch(reason){reportError(reason)}
 }

 useEffect(()=>{
  let active=true;
  async function load(){
   try{const data=await request<Status>('/push');if(active)setStatus(data)}
   catch(reason){if(active)reportError(reason)}
  }
  void load();
  const timer=setInterval(()=>void load(),5000);
  return()=>{active=false;clearInterval(timer)};
 },[request]);

 function edit(){
  setConfirmed(false);
  setId('');
  setResult('');
 }
 async function submit(event:FormEvent){
  event.preventDefault();
  if(!confirmed||!status?.subscribers||sending||!validDestination)return;
  const campaign=id||crypto.randomUUID();
  setId(campaign);
  setSending(true);
  setError('');
  try{
   await request('/push',{id:campaign,title,message,path:destination});
   setTitle('');setMessage('');setPath('/');setCustomPath('');edit();
   setResult('Рассылка поставлена в очередь.');
   await refresh();
  }catch(reason){reportError(reason)}
  finally{setSending(false)}
 }

 return <div className="push-admin">
  {error&&<div className="notice error" role="alert">{error}<button type="button" onClick={()=>void refresh()}>Обновить</button></div>}
  {result&&<p role="status">{result}</p>}
  <section className="panel">
   <div className="panel-heading"><h2>Новая рассылка</h2>{status&&<span>Активных подписок: {status.subscribers.toLocaleString('ru-RU')}</span>}</div>
   {status?.subscribers===0&&<p role="status">Пока нет активных подписчиков. Пользователи должны разрешить уведомления в установленном приложении.</p>}
   <form className="push-compose" onSubmit={submit}>
    <fieldset disabled={sending}>
     <label>Заголовок<input required maxLength={80} value={title} onChange={event=>{setTitle(event.target.value);edit()}}/></label>
     <label>Текст<textarea required maxLength={240} rows={3} value={message} onChange={event=>{setMessage(event.target.value);edit()}}/></label>
     <label>Куда перейти<select value={path} onChange={event=>{setPath(event.target.value);edit()}}>
      <option value="/">Главная</option><option value="/?tab=catalog">Каталог</option><option value="/?tab=cart">Корзина</option><option value="/?tab=favorites">Избранное</option><option value="/?tab=profile">Профиль</option><option value="/?tab=wardrobe">Гардероб</option><option value="/?blog=1">Блог и новости</option><option value="custom">Своя ссылка</option>
     </select></label>
     {path==='custom'&&<label>Ссылка внутри приложения<input required placeholder="/?product=123" value={customPath} onChange={event=>{setCustomPath(event.target.value);edit()}}/><small>Укажите путь внутри SIZEY, например /?product=123. Внешние адреса не поддерживаются.</small></label>}
     <label className="push-confirm"><input type="checkbox" checked={confirmed} onChange={event=>setConfirmed(event.target.checked)}/>Отправить всем активным подписчикам</label>
    </fieldset>
    <button className="primary" disabled={!confirmed||!status?.subscribers||sending||!title.trim()||!message.trim()||!validDestination}>
     {sending?'Ставим в очередь…':'Отправить рассылку'}
    </button>
   </form>
  </section>
  <section className="panel">
   <div className="panel-heading"><h2>История рассылок</h2></div>
   {status?.campaigns.length?<div className="table-wrap"><table>
    <thead><tr><th>Рассылка</th><th>Получатели</th><th>Принято сервисом</th><th>Показано</th><th>Открыто</th><th>В очереди</th><th>Ошибки</th><th>Пропущено</th><th>Без результата</th></tr></thead>
    <tbody>{status.campaigns.map(campaign=><tr key={campaign.id}>
     <td><strong>{campaign.title}</strong><br/><small>{formatDate.format(campaign.created)}</small></td>
     <td>{campaign.recipients}</td><td>{campaign.accepted}</td><td>{campaign.shown}</td><td>{campaign.opened}</td>
     <td>{campaign.pending}</td><td>{campaign.failed}</td><td>{campaign.skipped}</td><td>{campaign.unknown}</td>
    </tr>)}</tbody>
   </table></div>:<p className="push-empty">{status?'Рассылок пока нет.':'Загружаем историю…'}</p>}
  </section>
 </div>;
}
