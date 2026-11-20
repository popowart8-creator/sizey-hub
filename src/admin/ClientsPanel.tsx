import {useEffect,useRef,useState} from 'react';
import {Search,X,ExternalLink,RefreshCw,Plus} from 'lucide-react';
import useAdminDialog from './useAdminDialog';
import LoyaltyPanel from './LoyaltyPanel';
import ClientAccess from './ClientAccess';
import ClientFinancialActions from './ClientFinancialActions';
import './clients.css';

type Client={id:string;name:string;phone?:string;phoneNormalized?:string;loyalty?:boolean;loyaltyLevel?:{name?:string};bonusBalance?:number;registeredOnly?:boolean};
type Transaction={id?:string;type?:string;amount?:number;bonusAmount?:number;createdAt?:string};
type Props={onExpired:()=>void};
async function request(path:string,method='GET',body?:unknown){
 const response=await fetch('/hub-api/admin/loyalty'+path,{method,credentials:'same-origin',cache:'no-store',...(body===undefined?{}:{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})});
 let result:any;
 try{result=await response.json()}catch{throw new Error('Бонусная система вернула некорректный ответ')}
 if(!response.ok)throw Object.assign(new Error(result.message||'Ошибка загрузки клиентов'),{status:response.status});
 return result;
}
const items=(value:any,key:string):any[]=>Array.isArray(value)?value:Array.isArray(value?.[key])?value[key]:[];
const phone=(client:Client)=>client.phone||client.phoneNormalized||'—';
const normalizedPhone=(value:string)=>value.replace(/\D/g,'').replace(/^8(?=\d{10}$)/,'7');
const balance=(value?:number)=>typeof value==='number'?value.toLocaleString('ru-RU'):'—';

function ClientDrawer({client,onClose,onExpired,onSaved}:{client:Client;onClose:()=>void;onExpired:()=>void;onSaved:()=>void}){
 const [birthDate,setBirthDate]=useState('');
 const [activating,setActivating]=useState(false),[activated,setActivated]=useState<Client|null>(null);
 const [editing,setEditing]=useState(false),[saving,setSaving]=useState(false),[form,setForm]=useState({name:client.name||'',phone:client.phone||client.phoneNormalized||''});
 const [detail,setDetail]=useState<Client|null>(null),[transactions,setTransactions]=useState<Transaction[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState('');
 const root=useAdminDialog(onClose,false);
 const registeredOnly=client.registeredOnly===true&&!activated;
 const loyaltyId=activated?.id||client.id;
 const expiredRef=useRef(onExpired);
 expiredRef.current=onExpired;
 useEffect(()=>{if(registeredOnly){setDetail(client);setTransactions([]);setLoading(false);return}let active=true;async function load(){setLoading(true);setError('');try{
  const [info,history]=await Promise.all([request('/clients/'+encodeURIComponent(loyaltyId)),request('/clients/'+encodeURIComponent(loyaltyId)+'/transactions')]);
  if(active){setDetail(info.client||info);setTransactions(items(history,'transactions'))}
 }catch(e){if(active){if((e as {status?:number}).status===401)expiredRef.current();setError((e as Error).message)}}finally{if(active)setLoading(false)}}
 void load();return()=>{active=false};
 },[loyaltyId,registeredOnly]);
 async function save(event:import('react').FormEvent){event.preventDefault();setSaving(true);setError('');try{const updated=await request('/clients/'+encodeURIComponent(loyaltyId),'PATCH',{name:form.name.trim(),phone:form.phone.trim()});setDetail(updated.client||updated);setEditing(false);onSaved()}catch(e){if((e as {status?:number}).status===401)expiredRef.current();setError((e as Error).message)}finally{setSaving(false)}}
 async function activate(){
  if(activating)return;
  const customerPhone=phone(client);
  if(!window.confirm('Подключить '+(client.name||'клиента')+' к бонусной системе по телефону '+customerPhone+'?'))return;
  setActivating(true);setError('');
  try{
   const existing=await request('/clients?all=true');
   let account:Client|undefined=items(existing,'clients').find((c:Client)=>normalizedPhone(phone(c))===normalizedPhone(customerPhone));
   if(!account){
    try{const created=await request('/clients','POST',{name:client.name||'Клиент',phone:customerPhone,birthDate});account=created.client||created}
    catch(e){
     if((e as {status?:number}).status===409){
      const fresh=await request('/clients?all=true');
      account=items(fresh,'clients').find((c:Client)=>normalizedPhone(phone(c))===normalizedPhone(customerPhone));
     }
     if(!account)throw e;
    }
   }
   if(!account?.id||!/^[a-f0-9-]{36}$/i.test(account.id))throw new Error('Бонусная система не вернула идентификатор клиента. Проверьте список перед повтором.');
   setActivated(account);onSaved();
  }catch(e){if((e as {status?:number}).status===401)expiredRef.current();setError((e as Error).message)}
  finally{setActivating(false)}
 }
 const value=detail||activated||client;
 return <div className="editor-overlay clients-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}>
  <section className="editor clients-drawer" role="dialog" aria-modal="true" aria-labelledby="client-drawer-title" ref={root}>
   <header><div><span className="overline">КЛИЕНТЫ / ПРОГРАММА ЛОЯЛЬНОСТИ</span><h2 id="client-drawer-title">{value.name||'Карточка клиента'}</h2></div><button className="icon-button" aria-label="Закрыть карточку" onClick={onClose}><X size={20}/></button></header>
   <div className="clients-drawer-content">
    <div className="client-summary"><div><small>Телефон</small><strong>{phone(value)}</strong></div><div><small>Бонусный баланс</small><strong>{registeredOnly?'Не подключена':balance(value.bonusBalance)}</strong></div><div><small>Уровень лояльности</small><strong>{registeredOnly?'Без бонусной карты':value.loyaltyLevel?.name||'—'}</strong></div></div>
    {error&&<div className="notice error" role="alert">{error}</div>}
    {loading?<p role="status">Загрузка карточки и операций…</p>:<><h3>История операций</h3><div className="table-wrap"><table><thead><tr><th>Тип</th><th>Сумма</th><th>Дата</th></tr></thead><tbody>{transactions.map((t,i)=><tr key={t.id||i}><td>{t.type||'—'}</td><td>{balance(t.amount??t.bonusAmount)}</td><td>{t.createdAt?new Date(t.createdAt).toLocaleString('ru-RU'):'—'}</td></tr>)}</tbody></table></div>{!transactions.length&&!error&&<p className="clients-muted">Операций пока нет.</p>}</>}
    {registeredOnly?<div style={{display:"grid",gap:10}}><p className="clients-muted">Клиент зарегистрирован на сайте, но ещё не подключён к бонусной системе. Для подключения укажите дату рождения.</p><label>Дата рождения<input type="date" required value={birthDate} max={new Date().toISOString().slice(0,10)} onChange={e=>setBirthDate(e.target.value)}/></label><button className="primary" disabled={activating||loading||!birthDate||normalizedPhone(phone(client)).length<10} onClick={()=>void activate()}>{activating?"Подключение…":"Подключить к бонусной системе"}</button></div>:editing?<form onSubmit={save} style={{display:'grid',gap:12}}><label>Имя<input required maxLength={160} value={form.name} onChange={e=>setForm(v=>({...v,name:e.target.value}))}/></label><label>Телефон<input required maxLength={160} value={form.phone} onChange={e=>setForm(v=>({...v,phone:e.target.value}))}/></label><div style={{display:'flex',gap:8}}><button className="primary" disabled={saving||!form.name.trim()||!form.phone.trim()}>{saving?'Сохранение…':'Сохранить'}</button><button type="button" className="secondary" onClick={()=>setEditing(false)}>Отмена</button></div></form>:<button className="secondary" onClick={()=>{setForm({name:value.name||'',phone:value.phone||value.phoneNormalized||''});setEditing(true)}}>Редактировать клиента</button>}
    {!registeredOnly&&<ClientAccess key={loyaltyId+phone(value)} clientId={loyaltyId} onExpired={onExpired}/>}
    {!registeredOnly&&<ClientFinancialActions clientId={loyaltyId} transactions={transactions} onExpired={onExpired} onComplete={onSaved}/>}
    <a className="secondary" href="https://app.sizey.ru" target="_blank" rel="noreferrer">Открыть действующий кабинет <ExternalLink size={16}/></a>
   </div>
  </section>
 </div>;
}

export default function ClientsPanel({onExpired}:Props){
 const [clients,setClients]=useState<Client[]>([]),[search,setSearch]=useState(''),[selected,setSelected]=useState<Client|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState('');
 const [reload,setReload]=useState(0);
 const [creating,setCreating]=useState(false),[createBusy,setCreateBusy]=useState(false),[createError,setCreateError]=useState(''),[newClient,setNewClient]=useState({name:'',phone:'',birthDate:''});
 async function createClient(e:import('react').FormEvent){e.preventDefault();setCreateBusy(true);setCreateError('');try{const result=await request('/clients','POST',{name:newClient.name.trim(),phone:newClient.phone.trim(),birthDate:newClient.birthDate});setCreating(false);setNewClient({name:'',phone:'',birthDate:''});setReload(n=>n+1);const created=result.client||result;if(created.id)setSelected(created)}catch(err){setCreateError((err as Error).message);if((err as {status?:number}).status===401)onExpired()}finally{setCreateBusy(false)}}
 const expiredRef=useRef(onExpired);
 expiredRef.current=onExpired;
 const [section,setSection]=useState<'clients'|'settings'|'employees'>('clients');
 useEffect(()=>{let active=true;async function load(){setLoading(true);setError('');try{
  // The local registration directory is independent of the loyalty backend.
  // A failure in one source must not hide customers from the other source.
  const [loyaltyResult,registeredResult]=await Promise.allSettled([request('/clients?all=true'),fetch('/hub-api/admin/clients',{credentials:'same-origin',cache:'no-store'}).then(async response=>{const data=await response.json();if(!response.ok)throw Object.assign(new Error(data.message||'Ошибка загрузки регистраций'),{status:response.status});return data})]);
  if(loyaltyResult.status==='rejected'&&registeredResult.status==='rejected')throw registeredResult.reason;
  const all=loyaltyResult.status==='fulfilled'?[...items(loyaltyResult.value,'clients')] as Client[]:[];
  const phones=new Set(all.map(c=>normalizedPhone(phone(c))));
  if(registeredResult.status==='fulfilled')for(const account of items(registeredResult.value,'clients') as Client[]){
   const key=normalizedPhone(phone(account));
   if(!phones.has(key)){all.push({...account,registeredOnly:true});phones.add(key)}
  }
  if(active){setClients(all);if(loyaltyResult.status==='rejected'||registeredResult.status==='rejected')setError('Один из источников клиентов недоступен. Показаны доступные записи; попробуйте обновить список.');}
 }catch(e){if(active){if((e as {status?:number}).status===401)onExpired();setError((e as Error).message)}}finally{if(active)setLoading(false)}}
 void load();return()=>{active=false};
 },[reload]);
 const filtered=clients.filter(c=>((c.name||'')+' '+phone(c)).toLocaleLowerCase('ru').includes(search.toLocaleLowerCase('ru')));
 return <><div className="table-toolbar" style={{marginBottom:16,display:'flex',gap:8,flexWrap:'wrap'}}><button className="secondary" aria-pressed={section==='clients'} onClick={()=>setSection('clients')}>Клиенты и бонусы</button><button className="secondary" aria-pressed={section==='settings'} onClick={()=>setSection('settings')}>Настройки лояльности</button><button className="secondary" aria-pressed={section==='employees'} onClick={()=>setSection('employees')}>Сотрудники</button></div>{section!=='clients'?<LoyaltyPanel key={section} initialTab={section} hideClientTab onExpired={onExpired}/>:<section className="panel"><div className="table-toolbar"><div className="search-input"><Search size={18}/><input aria-label="Поиск клиентов" placeholder="Имя или телефон" value={search} onChange={e=>setSearch(e.target.value)}/></div><span className="result-count">{filtered.length} клиентов</span><button className="primary" type="button" onClick={()=>{setCreateError('');setCreating(true)}}><Plus size={18}/> Создать клиента</button><button className="secondary icon-button" aria-label="Обновить клиентов" disabled={loading} onClick={()=>setReload(n=>n+1)}><RefreshCw size={18}/></button></div>
 {error&&<div className="notice error" role="alert">{error}</div>}
 {loading?<p className="clients-state" role="status">Загружаем клиентов…</p>:<div className="table-wrap"><table className="clients-table"><thead><tr><th>Клиент</th><th>Телефон</th><th>Статус</th><th>Уровень</th><th>Бонусы</th></tr></thead><tbody>{filtered.map(c=><tr key={c.id} tabIndex={0} role="button" aria-label={'Открыть карточку: '+(c.name||phone(c))} onClick={()=>setSelected(c)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setSelected(c)}}}><td><div className="client-name"><span className="avatar">{(c.name||'К').slice(0,1)}</span>{c.name||'Клиент'}</div></td><td>{phone(c)}</td><td>{c.registeredOnly?'Только регистрация':'Бонусная система'}</td><td>{c.registeredOnly?'—':c.loyaltyLevel?.name||'—'}</td><td>{c.registeredOnly?'—':balance(c.bonusBalance)}</td></tr>)}</tbody></table>{!filtered.length&&<p className="clients-state">{search?'По запросу ничего не найдено.':'Клиентов пока нет.'}</p>}</div>}</section>}
 {section==='clients'&&creating&&<div className="editor-overlay clients-overlay" onMouseDown={e=>{if(e.target===e.currentTarget&&!createBusy)setCreating(false)}}><section className="editor clients-drawer" role="dialog" aria-modal="true" aria-label="Создать клиента"><header><div><span className="overline">КЛИЕНТЫ / ПРОГРАММА ЛОЯЛЬНОСТИ</span><h2>Создать клиента</h2></div><button className="icon-button" aria-label="Закрыть" disabled={createBusy} onClick={()=>setCreating(false)}><X size={20}/></button></header><div className="clients-drawer-content"><form onSubmit={createClient} style={{display:'grid',gap:14}}><label>Имя<input required maxLength={160} value={newClient.name} onChange={e=>setNewClient(v=>({...v,name:e.target.value}))}/></label><label>Телефон<input type="tel" required maxLength={22} placeholder="+7 999 123-45-67" value={newClient.phone} onChange={e=>setNewClient(v=>({...v,phone:e.target.value}))}/></label><label>Дата рождения<input type="date" required max={new Date().toISOString().slice(0,10)} value={newClient.birthDate} onChange={e=>setNewClient(v=>({...v,birthDate:e.target.value}))}/></label>{createError&&<div className="notice error" role="alert">{createError}</div>}<div style={{display:'flex',gap:8}}><button className="primary" disabled={createBusy||!newClient.name.trim()||!newClient.phone.trim()||!newClient.birthDate}>{createBusy?'Создаём…':'Создать клиента'}</button><button type="button" className="secondary" disabled={createBusy} onClick={()=>setCreating(false)}>Отмена</button></div></form></div></section></div>}
 {section==='clients'&&selected&&<ClientDrawer key={selected.id} client={selected} onClose={()=>setSelected(null)} onExpired={onExpired} onSaved={()=>setReload(n=>n+1)}/>}</>;
}
