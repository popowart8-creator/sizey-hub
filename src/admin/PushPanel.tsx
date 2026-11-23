import {useEffect,useState,type FormEvent} from 'react';

import type {PushCounts} from './analytics-types';
type Campaign=PushCounts&{id:string;title:string;created:number};
type Status={subscribers:number;campaigns:Campaign[]};
type Customer={id:string;name:string;phone:string};
type Automation={birthdayTitle:string;birthdayMessage:string;purchaseTitle:string;purchaseMessage:string;birthdayPath:string;purchasePath:string};
const formatDate=new Intl.DateTimeFormat('ru-RU',{dateStyle:'short',timeStyle:'short',timeZone:'Europe/Moscow'});

export default function PushPanel({request,onError}:{request:<T>(path:string,data?:unknown)=>Promise<T>;onError:(error:unknown)=>void}){
 const [settingsScreen,setSettingsScreen]=useState(false);
 const [status,setStatus]=useState<Status>();
 const [customers,setCustomers]=useState<Customer[]>([]);
 const [automation,setAutomation]=useState<Automation>();
 const [savingAutomation,setSavingAutomation]=useState(false);
 const [automationMessage,setAutomationMessage]=useState('');
 const [customAutomationPaths,setCustomAutomationPaths]=useState({birthdayPath:false,purchasePath:false});
 const [audience,setAudience]=useState<'all'|'selected'|'group'>('all');
 const [group,setGroup]=useState<'registered'|'subscribed'>('registered');
 const [selected,setSelected]=useState<string[]>([]);
 const [customerQuery,setCustomerQuery]=useState('');
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
  void request<{customers:Customer[]}>('/push/customers').then(data=>{if(active)setCustomers(data.customers)}).catch(reason=>{if(active)reportError(reason)});
  void request<{settings:Automation}>('/push/automation').then(data=>{if(active)setAutomation(data.settings)}).catch(reason=>{if(active)reportError(reason)});
  const timer=setInterval(()=>void load(),5000);
  return()=>{active=false;clearInterval(timer)};
 },[request]);

 async function saveAutomation(){
  if(!automation||savingAutomation)return;
  setSavingAutomation(true);setAutomationMessage('');
  try{const data=await request<{settings:Automation}>('/push/automation',automation);setAutomation(data.settings);setAutomationMessage('Настройки сохранены')}
  catch(reason){reportError(reason)}
  finally{setSavingAutomation(false)}
 }
  function edit(){
  setConfirmed(false);
  setId('');
  setResult('');
 }
 async function submit(event:FormEvent){
  event.preventDefault();
  if(!confirmed||!status||sending||!validDestination||(audience==='selected'&&!selected.length))return;
  const campaign=id||crypto.randomUUID();
  setId(campaign);
  setSending(true);
  setError('');
  try{
   await request('/push',{id:campaign,title,message,path:destination,audience,...(audience==='selected'?{customers:selected}:audience==='group'?{group}:{})});
   setTitle('');setMessage('');setPath('/');setCustomPath('');setAudience('all');setSelected([]);edit();
   setResult('Рассылка поставлена в очередь.');
   await refresh();
  }catch(reason){reportError(reason)}
  finally{setSending(false)}
 }

 if(settingsScreen)return <div className="push-admin push-settings-screen">
  <button type="button" className="secondary push-settings-back" onClick={()=>setSettingsScreen(false)}>← Назад к рассылкам</button>
  <div className="page-heading"><div><span className="overline">ПУШ-УВЕДОМЛЕНИЯ</span><h1>Автоматические уведомления</h1><p>Настройка сообщений для событий программы лояльности</p></div></div>
  <section className="panel">
   <div className="panel-heading"><h2>Автоматические уведомления</h2></div>
   <p>Уведомления отправляются автоматически после начисления бонусов. Здесь можно изменить их текст. Переменная <code>{'{amount}'}</code> подставит количество начисленных бонусов.</p>
   {automation?<div className="push-audience">
    <h3>День рождения</h3>
    <label>Заголовок<input maxLength={80} value={automation.birthdayTitle} onChange={event=>{setAutomation({...automation,birthdayTitle:event.target.value});setAutomationMessage('')}}/></label>
    <label>Текст<textarea maxLength={240} rows={3} value={automation.birthdayMessage} onChange={event=>{setAutomation({...automation,birthdayMessage:event.target.value});setAutomationMessage('')}}/></label>
    <label>Куда перейти<select value={customAutomationPaths.birthdayPath?'custom':automation.birthdayPath} onChange={event=>{setCustomAutomationPaths(current=>({...current,birthdayPath:event.target.value==='custom'}));if(event.target.value!=='custom')setAutomation({...automation,birthdayPath:event.target.value});setAutomationMessage('')}}><option value="/">Главная</option><option value="/?tab=catalog">Каталог</option><option value="/?tab=cart">Корзина</option><option value="/?tab=favorites">Избранное</option><option value="/?tab=profile">Профиль</option><option value="/?tab=wardrobe">Гардероб</option><option value="/?blog=1">Блог и новости</option><option value="custom">Своя ссылка</option></select></label>
    {customAutomationPaths.birthdayPath&&<label>Ссылка внутри приложения<input value={automation.birthdayPath} onChange={event=>{setAutomation({...automation,birthdayPath:event.target.value});setAutomationMessage('')}} placeholder="/?product=123"/></label>}
    <h3>После покупки</h3>
    <label>Заголовок<input maxLength={80} value={automation.purchaseTitle} onChange={event=>{setAutomation({...automation,purchaseTitle:event.target.value});setAutomationMessage('')}}/></label>
    <label>Текст<textarea maxLength={240} rows={3} value={automation.purchaseMessage} onChange={event=>{setAutomation({...automation,purchaseMessage:event.target.value});setAutomationMessage('')}}/></label>
    <label>Куда перейти<select value={customAutomationPaths.purchasePath?'custom':automation.purchasePath} onChange={event=>{setCustomAutomationPaths(current=>({...current,purchasePath:event.target.value==='custom'}));if(event.target.value!=='custom')setAutomation({...automation,purchasePath:event.target.value});setAutomationMessage('')}}><option value="/">Главная</option><option value="/?tab=catalog">Каталог</option><option value="/?tab=cart">Корзина</option><option value="/?tab=favorites">Избранное</option><option value="/?tab=profile">Профиль</option><option value="/?tab=wardrobe">Гардероб</option><option value="/?blog=1">Блог и новости</option><option value="custom">Своя ссылка</option></select></label>
    {customAutomationPaths.purchasePath&&<label>Ссылка внутри приложения<input value={automation.purchasePath} onChange={event=>{setAutomation({...automation,purchasePath:event.target.value});setAutomationMessage('')}} placeholder="/?product=123"/></label>}
    <button type="button" className="primary" disabled={savingAutomation} onClick={()=>void saveAutomation()}>{savingAutomation?'Сохраняем…':'Сохранить настройки'}</button>
    {automationMessage&&<p role="status">{automationMessage}</p>}
   </div>:<p>Загружаем настройки…</p>}
  </section>
 </div>;
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
     <label>Получатели<select value={audience} onChange={event=>{setAudience(event.target.value as 'all'|'selected'|'group');edit()}}>
      <option value="all">Все пользователи</option><option value="selected">Из списка клиентов</option><option value="group">Группа пользователей</option>
     </select></label>
     {audience==='group'&&<label>Группа<select value={group} onChange={event=>{setGroup(event.target.value as 'registered'|'subscribed');edit()}}><option value="registered">Все зарегистрированные</option><option value="subscribed">Подписчики push-уведомлений</option></select></label>}
     {audience==='selected'&&<div className="push-audience">
      <label>Выбрать клиентов по имени или телефону<input value={customerQuery} onChange={event=>setCustomerQuery(event.target.value)} placeholder="Найти клиента"/></label>
      <small>Выбрано: {selected.length}. Сообщение появится в профиле выбранных клиентов.</small>
      <div className="push-audience-list">{customers.filter(c=>(c.name+' '+c.phone).toLowerCase().includes(customerQuery.toLowerCase())).slice(0,100).map(customer=><label key={customer.id}><input type="checkbox" checked={selected.includes(customer.id)} onChange={event=>{setSelected(current=>event.target.checked?[...current,customer.id]:current.filter(id=>id!==customer.id));edit()}}/><span>{customer.name}<small>{customer.phone}</small></span></label>)}</div>
     </div>}
     <label className="push-confirm"><input type="checkbox" checked={confirmed} onChange={event=>setConfirmed(event.target.checked)}/>Подтверждаю отправку: {audience==='all'?'всем пользователям':audience==='selected'?selected.length+' выбранным клиентам':'группе пользователей'}</label>
    </fieldset>
    <button className="primary" disabled={!confirmed||!status||sending||!title.trim()||!message.trim()||!validDestination||(audience==='selected'&&!selected.length)}>
     {sending?'Ставим в очередь…':'Отправить рассылку'}
    </button>
   </form>
  </section>
  <section className="panel"><div className="panel-heading"><h2>Автоматические уведомления</h2></div><button type="button" className="action-row" onClick={()=>setSettingsScreen(true)}><span>Настроить тексты<small>День рождения и бонусы после покупки · всегда включены</small></span><span aria-hidden="true">→</span></button></section>
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
