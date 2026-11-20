import {useEffect,useState} from 'react';
import {Search,X,ExternalLink,RefreshCw} from 'lucide-react';
import useAdminDialog from './useAdminDialog';
import LoyaltyPanel from './LoyaltyPanel';
import './clients.css';

type Client={id:string;name:string;phone?:string;phoneNormalized?:string;loyalty?:boolean;loyaltyLevel?:{name?:string};bonusBalance?:number};
type Transaction={id?:string;type?:string;amount?:number;bonusAmount?:number;createdAt?:string};
type Props={onExpired:()=>void};
async function request(path:string){
 const response=await fetch('/hub-api/admin/loyalty'+path,{credentials:'same-origin',cache:'no-store'});
 let result:any;
 try{result=await response.json()}catch{throw new Error('Бонусная система вернула некорректный ответ')}
 if(!response.ok)throw Object.assign(new Error(result.message||'Ошибка загрузки клиентов'),{status:response.status});
 return result;
}
const items=(value:any,key:string):any[]=>Array.isArray(value)?value:Array.isArray(value?.[key])?value[key]:[];
const phone=(client:Client)=>client.phone||client.phoneNormalized||'—';
const balance=(value?:number)=>typeof value==='number'?value.toLocaleString('ru-RU'):'—';

function ClientDrawer({client,onClose,onExpired}:{client:Client;onClose:()=>void;onExpired:()=>void}){
 const [detail,setDetail]=useState<Client|null>(null),[transactions,setTransactions]=useState<Transaction[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState('');
 const root=useAdminDialog(onClose,false);
 useEffect(()=>{let active=true;async function load(){setLoading(true);setError('');try{
  const [info,history]=await Promise.all([request('/clients/'+encodeURIComponent(client.id)),request('/clients/'+encodeURIComponent(client.id)+'/transactions')]);
  if(active){setDetail(info.client||info);setTransactions(items(history,'transactions'))}
 }catch(e){if(active){if((e as {status?:number}).status===401)onExpired();setError((e as Error).message)}}finally{if(active)setLoading(false)}}
 void load();return()=>{active=false};
 },[client.id,onExpired]);
 const value=detail||client;
 return <div className="editor-overlay clients-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}>
  <section className="editor clients-drawer" role="dialog" aria-modal="true" aria-labelledby="client-drawer-title" ref={root}>
   <header><div><span className="overline">КЛИЕНТЫ / ПРОГРАММА ЛОЯЛЬНОСТИ</span><h2 id="client-drawer-title">{value.name||'Карточка клиента'}</h2></div><button className="icon-button" aria-label="Закрыть карточку" onClick={onClose}><X size={20}/></button></header>
   <div className="clients-drawer-content">
    <div className="client-summary"><div><small>Телефон</small><strong>{phone(value)}</strong></div><div><small>Бонусный баланс</small><strong>{balance(value.bonusBalance)}</strong></div><div><small>Уровень лояльности</small><strong>{value.loyaltyLevel?.name||'—'}</strong></div></div>
    {error&&<div className="notice error" role="alert">{error}</div>}
    {loading?<p role="status">Загрузка карточки и операций…</p>:<><h3>История операций</h3><div className="table-wrap"><table><thead><tr><th>Тип</th><th>Сумма</th><th>Дата</th></tr></thead><tbody>{transactions.map((t,i)=><tr key={t.id||i}><td>{t.type||'—'}</td><td>{balance(t.amount??t.bonusAmount)}</td><td>{t.createdAt?new Date(t.createdAt).toLocaleString('ru-RU'):'—'}</td></tr>)}</tbody></table></div>{!transactions.length&&!error&&<p className="clients-muted">Операций пока нет.</p>}</>}
    <p className="clients-muted">Редактирование клиента, начисление и списание бонусов пока доступны только в действующем кабинете. Новая админка не выполняет финансовые операции без проверенных контрактов API.</p>
    <a className="secondary" href="https://app.sizey.ru" target="_blank" rel="noreferrer">Открыть действующий кабинет <ExternalLink size={16}/></a>
   </div>
  </section>
 </div>;
}

export default function ClientsPanel({onExpired}:Props){
 const [clients,setClients]=useState<Client[]>([]),[search,setSearch]=useState(''),[selected,setSelected]=useState<Client|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState('');
 const [reload,setReload]=useState(0);
 const [section,setSection]=useState<'clients'|'settings'|'employees'>('clients');
 useEffect(()=>{let active=true;async function load(){setLoading(true);setError('');try{
  const result=await request('/clients?all=true');
  if(active)setClients(items(result,'clients'));
 }catch(e){if(active){if((e as {status?:number}).status===401)onExpired();setError((e as Error).message)}}finally{if(active)setLoading(false)}}
 void load();return()=>{active=false};
 },[reload,onExpired]);
 const filtered=clients.filter(c=>((c.name||'')+' '+phone(c)).toLocaleLowerCase('ru').includes(search.toLocaleLowerCase('ru')));
 return <><div className="table-toolbar" style={{marginBottom:16,display:'flex',gap:8,flexWrap:'wrap'}}><button className="secondary" aria-pressed={section==='clients'} onClick={()=>setSection('clients')}>Клиенты и бонусы</button><button className="secondary" aria-pressed={section==='settings'} onClick={()=>setSection('settings')}>Настройки лояльности</button><button className="secondary" aria-pressed={section==='employees'} onClick={()=>setSection('employees')}>Сотрудники</button></div>{section!=='clients'?<LoyaltyPanel key={section} initialTab={section} hideClientTab onExpired={onExpired}/>:<section className="panel"><div className="table-toolbar"><div className="search-input"><Search size={18}/><input aria-label="Поиск клиентов" placeholder="Имя или телефон" value={search} onChange={e=>setSearch(e.target.value)}/></div><span className="result-count">{filtered.length} клиентов</span><button className="secondary icon-button" aria-label="Обновить клиентов" disabled={loading} onClick={()=>setReload(n=>n+1)}><RefreshCw size={18}/></button></div>
 {error&&<div className="notice error" role="alert">{error}</div>}
 {loading?<p className="clients-state" role="status">Загружаем клиентов…</p>:<div className="table-wrap"><table className="clients-table"><thead><tr><th>Клиент</th><th>Телефон</th><th>Уровень</th><th>Бонусы</th></tr></thead><tbody>{filtered.map(c=><tr key={c.id} tabIndex={0} role="button" aria-label={'Открыть карточку: '+(c.name||phone(c))} onClick={()=>setSelected(c)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setSelected(c)}}}><td><div className="client-name"><span className="avatar">{(c.name||'К').slice(0,1)}</span>{c.name||'Клиент'}</div></td><td>{phone(c)}</td><td>{c.loyaltyLevel?.name||'—'}</td><td>{balance(c.bonusBalance)}</td></tr>)}</tbody></table>{!filtered.length&&<p className="clients-state">{search?'По запросу ничего не найдено.':'Клиентов пока нет.'}</p>}</div>}</section>}
 {section==='clients'&&selected&&<ClientDrawer key={selected.id} client={selected} onClose={()=>setSelected(null)} onExpired={onExpired}/>}</>;
}
