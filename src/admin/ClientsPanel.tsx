import {useEffect,useRef,useState} from 'react';
import {Search,X,ExternalLink,RefreshCw,Plus,ScanLine} from 'lucide-react';
import useAdminDialog from './useAdminDialog';
import LoyaltyPanel from './LoyaltyPanel';
import ClientAccess from './ClientAccess';
import ClientFinancialActions from './ClientFinancialActions';
import './clients.css';

type Client={id:string;name:string;phone?:string;phoneNormalized?:string;loyalty?:boolean;loyaltyLevel?:{name?:string};bonusBalance?:number;registeredOnly?:boolean};
type Transaction={id?:string;type?:string;amount?:number;bonusAmount?:number;createdAt?:string};
type Props={onExpired:()=>void;openScannerOnMount?:boolean};
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

function ClientDrawer({client,onClose,onExpired,onSaved,quickDebit=false}:{client:Client;onClose:()=>void;onExpired:()=>void;onSaved:()=>void;quickDebit?:boolean}){
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
    {!registeredOnly&&<ClientFinancialActions quickDebit={quickDebit} clientId={loyaltyId} transactions={transactions} onExpired={onExpired} onComplete={onSaved}/>}
    <a className="secondary" href="https://app.sizey.ru" target="_blank" rel="noreferrer">Открыть действующий кабинет <ExternalLink size={16}/></a>
   </div>
  </section>
 </div>;
}


const qrPhonePattern=/^SIZEY:PHONE:(7\d{10})$/;
const qrPattern=/^SIZEY:LOYALTY:([a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12})$/i;
function QRScanner({onCode,onClose}:{onCode:(code:string)=>void;onClose:()=>void}){
 const video=useRef<HTMLVideoElement>(null),stream=useRef<MediaStream|null>(null);
 const [error,setError]=useState(''),[manual,setManual]=useState(''),[cameraReady,setCameraReady]=useState(false);
 const scanRef=useRef(onCode);scanRef.current=onCode;
 useEffect(()=>{
  let cancelled=false,frame=0,busy=false;
  const canvas=document.createElement('canvas');
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  const start=async()=>{
   try{
    if(!navigator.mediaDevices?.getUserMedia)throw new Error('camera');
    const media=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});
    if(cancelled){media.getTracks().forEach(t=>t.stop());return}
    stream.current=media;
    const el=video.current;if(!el)return;
    el.srcObject=media;await el.play();if(!cancelled)setCameraReady(true);
    const scannerUrl='https://cdn.jsdelivr.net/npm/jsqr@1.4.0/+esm';
    const module=await import(/* @vite-ignore */ scannerUrl);
    const decode=(module.default||module) as (data:Uint8ClampedArray,width:number,height:number,options?:{inversionAttempts:string})=>{data:string}|null;
    let last=0;
    const tick=(now:number)=>{
     if(cancelled)return;
     frame=requestAnimationFrame(tick);
     if(busy||now-last<130||!ctx||el.readyState<2)return;
     busy=true;last=now;
     try{
      const width=640,height=Math.max(1,Math.round(640*el.videoHeight/Math.max(1,el.videoWidth)));
      canvas.width=width;canvas.height=height;ctx.drawImage(el,0,0,width,height);
      const pixels=ctx.getImageData(0,0,width,height);
      const result=decode(pixels.data,width,height,{inversionAttempts:'attemptBoth'});
      if(result&&(qrPattern.test(result.data.trim())||qrPhonePattern.test(result.data.trim()))){
       cancelAnimationFrame(frame);scanRef.current(result.data.trim());return;
      }
     }catch{}finally{busy=false}
    };
    frame=requestAnimationFrame(tick);
   }catch(e){
    if(!cancelled)setError(e instanceof Error&&e.message==='camera'?'Камера недоступна в этом браузере.':'Не удалось открыть камеру или загрузить сканер. Проверьте разрешение камеры и подключение.');
   }
  };
  void start();
  return()=>{cancelled=true;cancelAnimationFrame(frame);stream.current?.getTracks().forEach(t=>t.stop());stream.current=null};
 },[]);
 return <div className="editor-overlay clients-overlay clients-scanner-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}><section className="editor clients-drawer clients-scanner-dialog" role="dialog" aria-modal="true" aria-label="Сканер бонусной карты"><header><div><span className="overline">БОНУСНАЯ КАРТА</span><h2>Сканировать QR</h2></div><button className="icon-button" onClick={onClose} aria-label="Закрыть"><X/></button></header><div className="clients-drawer-content clients-scanner-content"><p>Наведите камеру на QR-код клиента. Списание только после подтверждения.</p><div className="clients-scanner-camera"><video ref={video} autoPlay playsInline muted/>{!cameraReady&&!error&&<span className="clients-scanner-status" role="status">Запускаем камеру…</span>}</div>{error&&<p role="status" className="clients-muted">{error}</p>}<form onSubmit={e=>{e.preventDefault();onCode(manual.trim())}} style={{display:'grid',gap:10}}><label>Код карты<input value={manual} onChange={e=>setManual(e.target.value)} placeholder="SIZEY:PHONE:..." autoComplete="off"/></label><button className="primary" disabled={!manual.trim()}>Найти клиента</button></form></div></section></div>
}
export default function ClientsPanel({onExpired,openScannerOnMount=false}:Props){
 const [clients,setClients]=useState<Client[]>([]),[search,setSearch]=useState(''),[selected,setSelected]=useState<Client|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState('');
 const [reload,setReload]=useState(0);const [scannerOpen,setScannerOpen]=useState(openScannerOnMount),[scannedClient,setScannedClient]=useState<string|null>(null);
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
 return <><div className="table-toolbar" style={{marginBottom:16,display:'flex',gap:8,flexWrap:'wrap'}}><button className="secondary" aria-pressed={section==='clients'} onClick={()=>setSection('clients')}>Клиенты и бонусы</button><button className="secondary" aria-pressed={section==='settings'} onClick={()=>setSection('settings')}>Настройки лояльности</button><button className="secondary" aria-pressed={section==='employees'} onClick={()=>setSection('employees')}>Сотрудники</button></div>{section!=='clients'?<LoyaltyPanel key={section} initialTab={section} hideClientTab onExpired={onExpired}/>:<section className="panel"><div className="table-toolbar"><div className="search-input"><Search size={18}/><input aria-label="Поиск клиентов" placeholder="Имя или телефон" value={search} onChange={e=>setSearch(e.target.value)}/></div><span className="result-count">{filtered.length} клиентов</span><button className="secondary" type="button" onClick={()=>{setError("");setScannerOpen(true)}}><ScanLine size={18}/> Сканировать QR</button><button className="primary" type="button" onClick={()=>{setCreateError('');setCreating(true)}}><Plus size={18}/> Создать клиента</button><button className="secondary icon-button" aria-label="Обновить клиентов" disabled={loading} onClick={()=>setReload(n=>n+1)}><RefreshCw size={18}/></button></div>
 {error&&<div className="notice error" role="alert">{error}</div>}
 {loading?<p className="clients-state" role="status">Загружаем клиентов…</p>:<div className="table-wrap"><table className="clients-table"><thead><tr><th>Клиент</th><th>Телефон</th><th>Статус</th><th>Уровень</th><th>Бонусы</th></tr></thead><tbody>{filtered.map(c=><tr key={c.id} tabIndex={0} role="button" aria-label={'Открыть карточку: '+(c.name||phone(c))} onClick={()=>setSelected(c)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setSelected(c)}}}><td><div className="client-name"><span className="avatar">{(c.name||'К').slice(0,1)}</span>{c.name||'Клиент'}</div></td><td>{phone(c)}</td><td>{c.registeredOnly?'Только регистрация':'Бонусная система'}</td><td>{c.registeredOnly?'—':c.loyaltyLevel?.name||'—'}</td><td>{c.registeredOnly?'—':balance(c.bonusBalance)}</td></tr>)}</tbody></table>{!filtered.length&&<p className="clients-state">{search?'По запросу ничего не найдено.':'Клиентов пока нет.'}</p>}</div>}</section>}
 {section==='clients'&&scannerOpen&&<QRScanner onClose={()=>setScannerOpen(false)} onCode={code=>{const match=qrPattern.exec(code);const phoneMatch=qrPhonePattern.exec(code);if(!match&&!phoneMatch){setError('Неверный QR-код SIZEY');setScannerOpen(false);return}const found=clients.find(c=>!c.registeredOnly&&(match?c.id.toLowerCase()===match[1].toLowerCase():normalizedPhone(phone(c))===phoneMatch![1]));if(!found){setError('Клиент не найден. Обновите список клиентов.');setScannerOpen(false);return}setScannedClient(found.id);setSelected(found);setScannerOpen(false)}}/>}{section==='clients'&&creating&&<div className="editor-overlay clients-overlay" onMouseDown={e=>{if(e.target===e.currentTarget&&!createBusy)setCreating(false)}}><section className="editor clients-drawer" role="dialog" aria-modal="true" aria-label="Создать клиента"><header><div><span className="overline">КЛИЕНТЫ / ПРОГРАММА ЛОЯЛЬНОСТИ</span><h2>Создать клиента</h2></div><button className="icon-button" aria-label="Закрыть" disabled={createBusy} onClick={()=>setCreating(false)}><X size={20}/></button></header><div className="clients-drawer-content"><form onSubmit={createClient} style={{display:'grid',gap:14}}><label>Имя<input required maxLength={160} value={newClient.name} onChange={e=>setNewClient(v=>({...v,name:e.target.value}))}/></label><label>Телефон<input type="tel" required maxLength={22} placeholder="+7 999 123-45-67" value={newClient.phone} onChange={e=>setNewClient(v=>({...v,phone:e.target.value}))}/></label><label>Дата рождения<input type="date" required max={new Date().toISOString().slice(0,10)} value={newClient.birthDate} onChange={e=>setNewClient(v=>({...v,birthDate:e.target.value}))}/></label>{createError&&<div className="notice error" role="alert">{createError}</div>}<div style={{display:'flex',gap:8}}><button className="primary" disabled={createBusy||!newClient.name.trim()||!newClient.phone.trim()||!newClient.birthDate}>{createBusy?'Создаём…':'Создать клиента'}</button><button type="button" className="secondary" disabled={createBusy} onClick={()=>setCreating(false)}>Отмена</button></div></form></div></section></div>}
 {section==='clients'&&selected&&<ClientDrawer key={selected.id} quickDebit={scannedClient===selected.id} client={selected} onClose={()=>{setSelected(null);setScannedClient(null)}} onExpired={onExpired} onSaved={()=>setReload(n=>n+1)}/>}</>;
}
