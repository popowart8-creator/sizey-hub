import {useEffect,useState,type FormEvent} from 'react';
type Props={onExpired:()=>void;initialTab?:'clients'|'settings'|'employees';hideClientTab?:boolean};
async function request(path:string,method='GET',data?:unknown){
 const r=await fetch('/hub-api/admin/loyalty'+path,{method,credentials:'same-origin',cache:'no-store',...(data===undefined?{}:{headers:{'Content-Type':'application/json'},body:JSON.stringify(data)})});
 const json=await r.json();
 if(!r.ok)throw Object.assign(new Error(json.message||'Ошибка бонусной системы'),{status:r.status});
 return json;
}
export default function LoyaltyPanel({onExpired,initialTab='clients',hideClientTab=false}:Props){
 const[tab,setTab]=useState<'clients'|'settings'|'employees'>(initialTab);
 const[selected,setSelected]=useState<any>(null);
 const[transactions,setTransactions]=useState<any[]>([]);
 const[employees,setEmployees]=useState<any[]>([]);
 const[search,setSearch]=useState('');
 const[clients,setClients]=useState<any[]>([]);
 const[settings,setSettings]=useState<any>(null);
 const[loading,setLoading]=useState(false);
 const[error,setError]=useState('');
 const[notice,setNotice]=useState('');
 const[editing,setEditing]=useState(false);
 const[form,setForm]=useState({companyName:'',timezone:'',currency:'',currencySymbol:'',maxBonusSpendPercent:0,birthdayMultiplier:1});
 async function load(which=tab){
  setLoading(true);setError('');
  try{
   if(which==='clients'){
    const result=await request(search.trim()?'/clients/search?q='+encodeURIComponent(search.trim()):'/clients?all=true');
    setClients(Array.isArray(result)?result:Array.isArray(result.clients)?result.clients:[]);
   }else if(which==='employees'){
    const result=await request('/users');
    setEmployees(Array.isArray(result)?result:Array.isArray(result.users)?result.users:[]);
   }else{
    const result=await request('/settings');
    setSettings(result);
    const source=result.settings||result;
    setForm({companyName:source.companyName||'',timezone:source.timezone||'',currency:source.currency||'',currencySymbol:source.currencySymbol||'',maxBonusSpendPercent:source.maxBonusSpendPercent??0,birthdayMultiplier:source.birthdayMultiplier??1});
   }
  }catch(e){const err=e as Error&{status?:number};if(err.status===401)onExpired();setError(err.message)}finally{setLoading(false)}
 }
 useEffect(()=>{void load(tab)},[tab]);
 async function openClient(id:string){setLoading(true);setError('');setSelected(null);setTransactions([]);try{const [detail,history]=await Promise.all([request('/clients/'+encodeURIComponent(id)),request('/clients/'+encodeURIComponent(id)+'/transactions')]);setSelected(detail.client||detail);setTransactions(Array.isArray(history)?history:Array.isArray(history.transactions)?history.transactions:[])}catch(e){const err=e as Error&{status?:number};if(err.status===401)onExpired();setError(err.message)}finally{setLoading(false)}}
 async function save(e:FormEvent){e.preventDefault();setLoading(true);setError('');setNotice('');try{await request('/settings','PATCH',form);setEditing(false);setNotice('Настройки сохранены в действующей бонусной системе');await load('settings')}catch(e){setError((e as Error).message);setLoading(false)}}
 return <section className="panel" style={{padding:24}}>
  <div className="table-toolbar"><div style={{display:'flex',gap:8}}>{!hideClientTab&&<button className="secondary" onClick={()=>setTab('clients')} aria-pressed={tab==='clients'}>Клиенты и бонусы</button>}<button className="secondary" onClick={()=>setTab('settings')} aria-pressed={tab==='settings'}>Настройки лояльности</button><button className="secondary" onClick={()=>setTab('employees')} aria-pressed={tab==='employees'}>Сотрудники</button></div><a className="secondary" href="https://app.sizey.ru" target="_blank" rel="noreferrer">Старый кабинет ↗</a></div>
  {error&&<div className="notice error" role="alert">{error}</div>}{notice&&<div className="notice" role="status">{notice}</div>}
  {tab==='clients'&&<><form onSubmit={e=>{e.preventDefault();void load('clients')}} style={{display:'flex',gap:8,margin:'20px 0'}}><input aria-label="Имя или телефон" placeholder="Имя или телефон" value={search} onChange={e=>setSearch(e.target.value)}/><button className="secondary" disabled={loading}>Найти</button></form><div className="table-wrap"><table><thead><tr><th>Клиент</th><th>Телефон</th><th>Уровень</th><th>Баланс</th></tr></thead><tbody>{clients.map((c,i)=><tr key={c.id||i}><td><button className="secondary" onClick={()=>void openClient(c.id)} disabled={!c.id}>{c.name||'Клиент'}</button></td><td>{c.phone||c.phoneNormalized||''}</td><td>{c.loyaltyLevel?.name||'—'}</td><td>{c.bonusBalance??'—'}</td></tr>)}</tbody></table></div>{!loading&&!clients.length&&<p>Клиенты не найдены.</p>}{selected&&<section className="panel" style={{padding:20,marginTop:20}}><div className="panel-heading"><h2>{selected.name||'Карточка клиента'}</h2><button className="secondary" onClick={()=>setSelected(null)}>Закрыть</button></div><p>Телефон: {selected.phone||selected.phoneNormalized||'—'} · Баланс: {selected.bonusBalance??'—'}</p><h3>История операций</h3><div className="table-wrap"><table><thead><tr><th>Тип</th><th>Сумма</th><th>Дата</th></tr></thead><tbody>{transactions.map((t,i)=><tr key={t.id||i}><td>{t.type||'—'}</td><td>{t.amount??t.bonusAmount??'—'}</td><td>{t.createdAt?new Date(t.createdAt).toLocaleString('ru-RU'):'—'}</td></tr>)}</tbody></table></div>{!transactions.length&&<p>Операций нет.</p>}</section>}</>}
  {tab==='employees'&&<div className="table-wrap" style={{marginTop:20}}><table><thead><tr><th>Сотрудник</th><th>Роль</th><th>Статус</th></tr></thead><tbody>{employees.map((u,i)=><tr key={u.id||i}><td>{u.name||u.login||'—'}</td><td>{u.role||'—'}</td><td>{u.status||'—'}</td></tr>)}</tbody></table>{!loading&&!employees.length&&<p>Сотрудники не найдены.</p>}</div>}
  {tab==='settings'&&settings&&<form onSubmit={save} style={{display:'grid',gap:12,maxWidth:560,marginTop:20}}>{([
    ['companyName','Название компании'],['timezone','Часовой пояс'],['currency','Валюта'],['currencySymbol','Символ валюты'],['maxBonusSpendPercent','Максимальный процент оплаты бонусами'],['birthdayMultiplier','Множитель в день рождения']
   ] as const).map(([key,label])=><label key={key} style={{display:'grid',gap:6}}>{label}<input disabled={!editing||loading} type={typeof form[key]==='number'?'number':'text'} min={typeof form[key]==='number'?0:undefined} step={typeof form[key]==='number'?'any':undefined} value={form[key]} onChange={e=>setForm(v=>({...v,[key]:typeof v[key]==='number'?Number(e.target.value):e.target.value}))}/></label>)}<p>Уровни лояльности сохраняются действующим backend; их редактирование будет добавлено после проверки формата ответа.</p><div style={{display:'flex',gap:8}}>{!editing?<button type="button" className="secondary" onClick={()=>setEditing(true)}>Редактировать</button>:<><button className="primary" disabled={loading}>Сохранить</button><button type="button" className="secondary" onClick={()=>{setEditing(false);void load('settings')}}>Отмена</button></>}</div></form>}
  {loading&&<p role="status">Загрузка…</p>}
 </section>
}
