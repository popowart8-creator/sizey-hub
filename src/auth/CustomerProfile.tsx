import CustomerSheet from '../CustomerSheet';
import MenuRow from '../MenuRow';
import PageHeader from '../PageHeader';
import {track} from '../analytics';
import HapticAction from '../HapticAction';
import {ProfileSkeleton,BonusSkeleton,BonusHistorySkeleton} from '../Skeleton';
import{useEffect,useState,useRef,type ChangeEvent,type ComponentPropsWithoutRef,type FormEvent,type ReactNode}from'react';
import{createPortal}from'react-dom';
import{LogOut,RefreshCw,KeyRound,Eye,EyeOff,Gift}from'lucide-react';
export type Customer={id:string;phone:string;mustChangePassword:boolean;phoneVerified:boolean};
type Loyalty={linked:boolean;pendingVerification?:boolean;verificationCode?:string;name?:string;clientId?:string;balance:number|null;level?:string;history:{id:string;amount:number;description:string;date:string}[]};
export class RequestError extends Error{constructor(public status:number,message:string){super(message)}}
export async function api<T>(path:string,body?:unknown):Promise<T>{const r=await fetch('/hub-api'+path,{credentials:'same-origin',cache:'no-store',...(body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})});let data;try{data=await r.json()}catch{throw new RequestError(r.status,'Сервис временно недоступен. Попробуйте позже.')}if(!r.ok)throw new RequestError(r.status,data.message||'Не удалось выполнить запрос');return data}
// Explicit offline loyalty-card snapshot. Never cache credentials or transaction history.
const OFFLINE_CARD_KEY='sizey:offline:loyalty-card:v1';
function readOfflineCard(){try{const x=JSON.parse(localStorage.getItem(OFFLINE_CARD_KEY)||'null');return x?.user?.id&&x?.loyalty?.linked?x:null}catch{return null}}
const offlineCard=readOfflineCard();
function saveOfflineCard(user:Customer,loyalty:Loyalty){if(!loyalty.linked)return;try{localStorage.setItem(OFFLINE_CARD_KEY,JSON.stringify({user:{id:user.id,phone:user.phone,mustChangePassword:false,phoneVerified:user.phoneVerified},loyalty:{linked:true,name:loyalty.name,clientId:loyalty.clientId,balance:loyalty.balance,level:loyalty.level,history:[]},savedAt:Date.now()}))}catch{}}
let profileEpoch=0;
let cachedUser:Customer|null=offlineCard?.user||null;
let cachedLoyalty:Loyalty|null=offlineCard?.loyalty||null;
let profileValidatedAt=0;
let loyaltyFetchedAt=0;
const PROFILE_CACHE_TTL=60_000;
const LOYALTY_CACHE_TTL=30_000;
function clearProfileCache(){try{localStorage.removeItem(OFFLINE_CARD_KEY)}catch{}profileEpoch++;cachedUser=null;cachedLoyalty=null;profileValidatedAt=0;loyaltyFetchedAt=0}
function maskPhone(value:string){
 const digits=value.replace(/\D/g,'');
 const hasCountry=value.trimStart().startsWith('+7')||(/^([78])\d{10,}$/.test(digits));
 const national=hasCountry?digits.slice(1):digits;
 const local=(/^[78]\d{10}$/.test(national)?national.slice(1):national).slice(0,10);
 return '+7'+(local?' '+local.slice(0,3):'')+(local.length>3?' '+local.slice(3,6):'')+(local.length>6?'-'+local.slice(6,8):'')+(local.length>8?'-'+local.slice(8):'');
}
function AuthField({label,children,prefixOnly=false,...input}:{label:string;children?:ReactNode;prefixOnly?:boolean}&ComponentPropsWithoutRef<'input'>){
 return <div className={'auth-field'+(children?' auth-field--with-action':'')+(prefixOnly?' auth-field--prefix-only':'')}>
  <input {...input} placeholder={label}/>
  <label htmlFor={input.id}>{label}</label>
  {children}
 </div>;
}
function PasswordField({id,label,value,onChange,creating}:{id:string;label:string;value:string;onChange:(value:string)=>void;creating:boolean}){
 const [visible,setVisible]=useState(false);
 const Icon=visible?EyeOff:Eye;
 return <AuthField id={id} label={label} name={id==='auth-password'?'password':undefined} type={visible?'text':'password'} autoComplete={creating?'new-password':'current-password'} minLength={creating?10:undefined} maxLength={128} required value={value} onChange={event=>onChange(event.target.value)}>
   <button type="button" aria-label={(visible?'Скрыть пароль':'Показать пароль')+(id.endsWith('confirmation')?' в поле подтверждения':id==='current-password'?' в поле текущего пароля':id==='new-password'?' в поле нового пароля':'')} onClick={()=>setVisible(value=>!value)}><Icon size={20} aria-hidden="true"/></button>
 </AuthField>;
}
export default function CustomerProfile({children,onScreenChange,onViewChange,onHistoryOpen,historyOnly=false}:{children?:ReactNode;onScreenChange?:(open:boolean)=>void;onViewChange?:(screen:string)=>void;onHistoryOpen?:()=>void;historyOnly?:boolean}){
 const initialBonus=useRef<Promise<{data:Loyalty}|{error:unknown}>|null>(null);

 const[user,setUser]=useState<Customer|null>(cachedUser),[checking,setChecking]=useState(!cachedUser),[mode,setMode]=useState<'login'|'register'|'change'>('login'),[phone,setPhone]=useState('+7'),[password,setPassword]=useState(''),[newPassword,setNewPassword]=useState(''),[confirmation,setConfirmation]=useState(''),[consent,setConsent]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[loyalty,setLoyalty]=useState<Loyalty|null>(cachedLoyalty),[loyaltyError,setLoyaltyError]=useState(''),[loadingBonus,setLoadingBonus]=useState(!cachedLoyalty);
 useEffect(()=>{let active=true;if(cachedUser&&navigator.onLine&&Date.now()-profileValidatedAt<PROFILE_CACHE_TTL)return()=>{active=false};if(!navigator.onLine){setChecking(false);setLoadingBonus(false);return()=>{active=false}};initialBonus.current=cachedLoyalty?null:api<Loyalty>('/loyalty').then(data=>({data})).catch(error=>({error}));api<{user:Customer}>('/auth/me').then(x=>{if(active){if(cachedUser&&cachedUser.id!==x.user.id){profileEpoch++;cachedLoyalty=null;setLoyalty(null)}cachedUser=x.user;profileValidatedAt=Date.now();if(cachedLoyalty?.linked)saveOfflineCard(x.user,cachedLoyalty);setUser(previous=>previous&&JSON.stringify(previous)===JSON.stringify(x.user)?previous:x.user)}}).catch(e=>{if(active){if(e.status===401){clearProfileCache();setUser(null);setLoyalty(null)}else setError(e.message)}}).finally(()=>{if(active)setChecking(false)});return()=>{active=false}},[]);
 async function loadBonus(force=false){if(!force&&cachedLoyalty&&Date.now()-loyaltyFetchedAt<LOYALTY_CACHE_TTL){setLoyalty(cachedLoyalty);return}const epoch=profileEpoch,customerId=user?.id;setLoadingBonus(!loyalty&&!cachedLoyalty);setLoyaltyError('');try{const pending=initialBonus.current;initialBonus.current=null;const prefetched=pending?await pending:null;if(prefetched&&'error'in prefetched)throw prefetched.error;const x=prefetched?prefetched.data:await api<Loyalty>('/loyalty');if((x.linked&&!Number.isFinite(x.balance))||!Array.isArray(x.history))throw new Error('Бонусная система временно недоступна');if(epoch!==profileEpoch||cachedUser?.id!==customerId)return;cachedLoyalty=x;loyaltyFetchedAt=Date.now();if(user)saveOfflineCard(user,x);setLoyalty(previous=>previous&&JSON.stringify(previous)===JSON.stringify(x)?previous:x)}catch(e){if(epoch!==profileEpoch)return;if((e as RequestError).status===401){clearProfileCache();setUser(null);setLoyalty(null)}setLoyaltyError((e as Error).message)}finally{setLoadingBonus(false)}}
 useEffect(()=>{if(user&&!user.mustChangePassword)void loadBonus();else{setLoyalty(null);setLoyaltyError('')}},[user?.id,user?.mustChangePassword]);
 useEffect(()=>{if(historyOnly&&user&&!user.mustChangePassword)void loadBonus(true)},[historyOnly,user?.id]);
 useEffect(()=>{const refresh=()=>{if(document.visibilityState==='visible'&&cachedUser&&Date.now()-loyaltyFetchedAt>=LOYALTY_CACHE_TTL)void loadBonus()};document.addEventListener('visibilitychange',refresh);return()=>document.removeEventListener('visibilitychange',refresh)},[user?.id,user?.mustChangePassword]);
 const [authToast,setAuthToast]=useState<{message:string}|null>(null);
 const loginError=!user?error:'';
 useEffect(()=>{if(loginError)setAuthToast({message:loginError})},[loginError]);
 useEffect(()=>{
  if(!authToast)return;
  const timer=window.setTimeout(()=>setAuthToast(null),5000);
  return()=>window.clearTimeout(timer);
 },[authToast]);
 function changePhone(event:ChangeEvent<HTMLInputElement>){
  const input=event.currentTarget;
  const cursor=input.selectionStart??input.value.length;
  const next=maskPhone(input.value);
  const digitsAfter=input.value.slice(cursor).replace(/\D/g,'').length;
  setPhone(next);
  requestAnimationFrame(()=>{
   if(document.activeElement!==input)return;
   let position=next.length,remaining=digitsAfter;
   while(position>2&&remaining>0){if(/\d/.test(next[--position]))remaining--}
   input.setSelectionRange(position,position);
  });
 }
 const clear=()=>{setAuthToast(null);setPassword('');setNewPassword('');setConfirmation('');setError('')};
 function validate(form:HTMLFormElement){
  const invalid=form.querySelector<HTMLInputElement>('input:invalid');
  if(invalid){
   invalid.focus();
   const message=invalid.id==='auth-phone'?'Введите номер полностью, начиная с +7':
    invalid.validity.tooShort?'Пароль должен содержать не менее 10 символов':
    invalid.type==='checkbox'?'Подтвердите согласие на обработку данных':
    'Заполните поле «'+(invalid.labels?.[0]?.textContent||'Обязательное поле')+'»';
   setAuthToast({message});return false;
  }
  return true;
 }
 async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();setAuthToast(null);
  if(!validate(e.currentTarget))return;
 if(mode==='register'&&password!==confirmation){setAuthToast({message:'Пароли не совпадают'});return}setBusy(true);try{const data=await api<{user:Customer}>('/auth/'+mode,{phone,password,consent,...(mode==='register'?{name:[lastName,firstName,middleName].map(v=>v.trim()).filter(Boolean).join(' '),firstName:firstName.trim(),lastName:lastName.trim(),middleName:middleName.trim()}: {})});initialBonus.current=null;profileEpoch++;cachedLoyalty=null;loyaltyFetchedAt=0;profileValidatedAt=Date.now();track(mode==='register'?'register_success':'login_success');cachedUser=data.user;if(data.user.mustChangePassword){cachedLoyalty=null;setLoyalty(null)}setUser(data.user);clear();setMode('login')}catch(e){setAuthToast({message:(e as Error).message})}finally{setBusy(false)}}
 async function change(e:FormEvent<HTMLFormElement>){e.preventDefault();setAuthToast(null);if(!validate(e.currentTarget))return;if(newPassword!==confirmation){setAuthToast({message:'Пароли не совпадают'});return}setError('');setBusy(true);try{const data=await api<{user:Customer}>('/auth/change-password',{currentPassword:password,newPassword});track('password_change');initialBonus.current=null;profileValidatedAt=Date.now();cachedUser=data.user;if(data.user.mustChangePassword){cachedLoyalty=null;setLoyalty(null)}setUser(data.user);clear();setMode('login')}catch(e){setAuthToast({message:(e as Error).message})}finally{setBusy(false)}}
 const logoutDialog=useRef<HTMLDialogElement>(null);
 const cancelLogout=useRef<HTMLButtonElement>(null);
 function openLogoutDialog(){
  logoutDialog.current?.showModal();
  cancelLogout.current?.focus();
 }
 function confirmLogout(event:FormEvent<HTMLFormElement>){
  event.preventDefault();
  logoutDialog.current?.close();
  void logout();
 }
 async function logout(){setBusy(true);setError('');try{await api('/auth/logout',{});track('logout');initialBonus.current=null;clearProfileCache();setLoyalty(null);setUser(null);clear();setMode('login')}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 useEffect(()=>{if(!checking)onViewChange?.(user?(user.mustChangePassword||mode==='change'?'password_change':'profile'):mode==='register'?'register':'login')},[checking,!!user,user?.mustChangePassword,mode,onViewChange]);
 const [offlineQr,setOfflineQr]=useState(()=>{try{const key=localStorage.getItem('sizey:loyalty-qr:last');return key?localStorage.getItem(key)||'':''}catch{return ''}});
 const [offlineQrOpen,setOfflineQrOpen]=useState(false);
 const [firstName,setFirstName]=useState(''),[lastName,setLastName]=useState(''),[middleName,setMiddleName]=useState('');
 const [bonusHistoryOpen,setBonusHistoryOpen]=useState(false);
 const [gradesOpen,setGradesOpen]=useState(false);const [qrOpen,setQrOpen]=useState(false),[qrImage,setQrImage]=useState(''),[qrError,setQrError]=useState('');
 useEffect(()=>{
  if(!loyalty?.linked||!user?.phone){setQrImage('');setQrError('');return}
  let active=true;
  const digits=user.phone.replace(/\D/g,'');
  const cacheKey='sizey:loyalty-qr:v1:'+digits;
  let cached='';
  try{cached=localStorage.getItem(cacheKey)||''}catch{}
  setQrImage(cached.startsWith('data:image/png;base64,')?cached:'');if(cached.startsWith('data:image/png;base64,'))setOfflineQr(cached);
  setQrError('');
  // Keep the previously generated image available when offline.
  if(cached.startsWith('data:image/png;base64,'))return;
  const url='https://cdn.jsdelivr.net/npm/qrcode@1.5.4/+esm';
  import(/* @vite-ignore */ url).then(async module=>{
   const image=await module.toDataURL('SIZEY:PHONE:'+digits,{width:640,margin:3,errorCorrectionLevel:'M'});
   if(!active)return;
   setQrImage(image);setOfflineQr(image);
   try{localStorage.setItem(cacheKey,image);localStorage.setItem('sizey:loyalty-qr:last',cacheKey)}catch{/* Storage may be unavailable or full. */}
  }).catch(()=>{if(active)setQrError('Не удалось создать QR-код. Подключитесь к интернету один раз.')});
  return()=>{active=false}
 },[user?.phone,loyalty?.linked]);
 const grade=(loyalty?.level||'').trim();
 const gradeKey=grade.toLowerCase();
 const gradeTone=/платин|platin|diamond|бриллиант/.test(gradeKey)?'platinum':/золот|gold/.test(gradeKey)?'gold':/сереб|silver/.test(gradeKey)?'silver':/бронз|bronze/.test(gradeKey)?'bronze':'base';
 const[changeLeaving,setChangeLeaving]=useState(false);const leaveChange=()=>{if(user?.mustChangePassword)return;setChangeLeaving(true);setTimeout(()=>{clear();setMode('login');setChangeLeaving(false)},280)};useEffect(()=>{onScreenChange?.(!!user&&(user.mustChangePassword||mode==='change'));return()=>onScreenChange?.(false)},[!!user,user?.mustChangePassword,mode]);
 if(!historyOnly&&(checking||(!!user&&!user.mustChangePassword&&!loyalty&&!loyaltyError)))return<main className="authpage"><ProfileSkeleton/></main>;
 if(historyOnly)return <main className="native-detail-content bonus-history-screen">
  {checking||loadingBonus?<BonusHistorySkeleton/>:!user?<p className="authhint">Войдите в профиль, чтобы посмотреть историю бонусов.</p>:loyaltyError?<p className="authhint" role="alert">{loyaltyError} <button type="button" onClick={()=>void loadBonus(true)}>Повторить</button></p>:loyalty?.linked?(loyalty.history.length?loyalty.history.map(x=><div className="bonusoperation" key={x.id}><div><span>{x.description}</span><small>{new Date(x.date).toLocaleDateString('ru-RU')}</small></div><strong>{x.amount>0?'+':''}{x.amount.toLocaleString('ru-RU')}</strong></div>):<div className="empty empty-state native-zero-state"><Gift size={54} strokeWidth={1.4}/><h3>История пока пуста</h3><p>Здесь появятся начисления и списания бонусов после операций с вашей картой.</p><button type="button" className="blackbtn" onClick={()=>void loadBonus(true)}>Обновить историю</button></div>):<div className="empty empty-state native-zero-state"><Gift size={54} strokeWidth={1.4}/><h3>Карта пока не подключена</h3><p>Подключите бонусную карту в профиле, чтобы видеть историю операций.</p></div>}
 </main>;
 return<main className="authpage">{user&&!navigator.onLine&&<p className="authhint">Офлайн-режим: сохранённая бонусная карта. Баланс может быть устаревшим.</p>}{!user&&!navigator.onLine&&offlineQr.startsWith('data:image/png;base64,')&&<><button type="button" className="outlinebtn" onClick={()=>setOfflineQrOpen(true)}>Показать сохранённый QR-код</button>{offlineQrOpen&&<CustomerSheet title="Бонусная карта" onClose={()=>setOfflineQrOpen(false)}><div className="customer-sheet-qr"><img className="sizey-qr-image" src={offlineQr} alt="Сохранённый QR-код"/><p>QR-код доступен без интернета</p></div></CustomerSheet>}</>}{user&&(user.mustChangePassword||mode==='change')?createPortal(<div role="dialog" aria-modal="true" aria-label="Смена пароля" className={"password-screen "+(changeLeaving?"password-screen--leaving":"")}><PageHeader title={user.mustChangePassword?'Задай свой пароль':'Смена пароля'} onBack={user.mustChangePassword?undefined:leaveChange}/><section className="authcard authcard--native password-card"><form onSubmit={change} noValidate>
 <PasswordField id="current-password" label={user.mustChangePassword?'Временный пароль':'Текущий пароль'} value={password} onChange={setPassword} creating={false}/>
 <PasswordField id="new-password" label="Новый пароль" value={newPassword} onChange={setNewPassword} creating/>
 <PasswordField id="password-confirmation" label="Повтори новый пароль" value={confirmation} onChange={setConfirmation} creating/>
 <button className="blackbtn" disabled={busy}>{busy?'Сохраняем…':'Сохранить пароль'}</button></form></section></div>,document.body):user?<><div className="customerlayout"><section className="customer-profile-heading"><h3>{loyalty?.name?.trim()||'SIZEY'}</h3>{error&&<p className="autherror" role="alert">{error}</p>}</section><section className="customerbonus"><div className="sizey-card-interactive" data-grade={gradeTone}><HapticAction disabled={!loyalty?.linked} onActivate={()=>{if(/Android/i.test(navigator.userAgent))try{navigator.vibrate?.(10)}catch{}setQrOpen(true)}} ariaLabel="Показать QR-код бонусной карты" className={!loyalty||loadingBonus?"sizey-bonus-card sizey-bonus-card--loading":"sizey-bonus-card sizey-bonus-card--"+gradeTone}><div className="sizey-bonus-card-content"><div className="sizey-bonus-top"><span className="sizey-bonus-brand sizey-bonus-client-name" title={loyalty?.name?.trim()||undefined}>{loyalty?.name?.trim().split(/\s+/).filter(Boolean)[1]||loyalty?.name?.trim().split(/\s+/)[0]||"Клиент"}</span>{loyalty?.linked&&loyalty.level&&<span className="sizey-bonus-grade">{loyalty.level}</span>}</div><div className="sizey-bonus-main"><div className="sizey-bonus-amount"><span className="sizey-bonus-caption">1 бонус = 1₽</span>{loadingBonus?<span className="sizey-skeleton-bone sizey-bonus-loading-balance"/>:<strong className="sizey-bonus-number">{loyalty?.linked&&loyalty.balance!==null?loyalty.balance.toLocaleString('ru-RU'):'—'}</strong>}</div>{loyalty?.linked&&<span className="sizey-bonus-mini-qr" aria-hidden="true">{qrImage?<img src={qrImage} alt=""/>:<span className="sizey-qr-shimmer" role="status" aria-label="Загружаем QR-код"/>}</span>}</div>{!loyalty?.linked&&!loadingBonus&&<span className="sizey-bonus-level">Карта не подключена</span>}</div></HapticAction>{loyalty?.linked&&loyalty.level&&<button type="button" className="sizey-grade-info-trigger" aria-label={"Подробнее об уровне "+loyalty.level} onClick={()=>setGradesOpen(true)}>{loyalty.level}</button>}</div>{loyalty?.linked&&<p className="sizey-qr-hint">Нажмите на карту, чтобы показать QR-код</p>}{loyalty&&loyaltyError&&<p className="authhint" role="status">Не удалось обновить данные. <button className="textbtn" onClick={()=>loadBonus(true)}>Обновить</button></p>}{!loadingBonus&&(loyalty?.linked?null:<div className="sizey-bonus-connect"><h3>{loyalty?.pendingVerification?'Подключи бонусную карту':'Твои бонусы ждут тебя'}</h3><p role="status">{loyalty?.pendingVerification?'Сотрудник магазина проверит номер телефона и поможет подключить карту. Для подтверждения покажи код из профиля.':loyalty?.linked===false?'Карта по этому номеру не найдена. Обратись в магазин SIZEY для подключения.':loyaltyError||'Подключаем бонусную систему…'}</p>{loyalty?.pendingVerification&&loyalty.verificationCode&&<p>Код подтверждения <strong>{loyalty.verificationCode}</strong></p>}<a className="textbtn" href="tel:+79785131993" onClick={()=>track('support_click')}>Связаться с магазином ↗</a><button className="outlinebtn" onClick={()=>void loadBonus(true)}><RefreshCw size={18}/>Обновить</button></div>)}</section></div>{gradesOpen&&<CustomerSheet title="Уровни SIZEY" closeLabel="Закрыть уровни SIZEY" onClose={()=>setGradesOpen(false)}><div className="sizey-grades-info"><p>Уровень зависит от общей суммы покупок. Чем выше уровень, тем больше бонусов начисляется за покупки.</p><div className="sizey-grades-list">{[{name:"Бронза",rate:"3%",range:"До 30 000 ₽",tone:"bronze"},{name:"Серебро",rate:"5%",range:"От 30 000 ₽ до 100 000 ₽",tone:"silver"},{name:"Золото",rate:"7%",range:"От 100 000 ₽ до 300 000 ₽",tone:"gold"},{name:"Платина",rate:"10%",range:"От 300 000 ₽",tone:"platinum"}].map(level=><div key={level.name} data-grade={level.tone} className={"sizey-grades-item"+(gradeTone===level.tone?" is-current":"")}><span className={"sizey-grades-dot "+level.tone}/><div><strong>{level.name} — {level.rate}</strong><small>{level.range}{gradeTone===level.tone?" · Ваш текущий уровень":""}</small></div></div>)}</div><p className="sizey-grades-note"><strong>1 бонус = 1 ₽.</strong> Бонусами можно оплатить не более <strong>40% суммы чека</strong> за одну покупку.</p></div></CustomerSheet>}{qrOpen&&loyalty?.linked&&<CustomerSheet title="Бонусная карта" closeLabel="Закрыть QR-код" onClose={()=>setQrOpen(false)}><div className="customer-sheet-qr">{qrImage?<img className="sizey-qr-image" src={qrImage} alt="QR-код для сканирования сотрудником SIZEY"/>:<div className="sizey-qr-loading" role="status" aria-label={qrError||'Создаём QR-код…'}><span className="sizey-qr-shimmer"/>{qrError&&<p>{qrError}</p>}</div>}<p>Покажите QR-код сотруднику магазина</p></div></CustomerSheet>}{bonusHistoryOpen&&loyalty?.linked&&<CustomerSheet title="История бонусов" closeLabel="Закрыть историю бонусов" onClose={()=>setBonusHistoryOpen(false)}>{loyaltyError&&<p className="authhint" role="status">Не удалось обновить историю бонусов.</p>}{loyalty.history.length?loyalty.history.map(x=><div className="bonusoperation" key={x.id}><div><span>{x.description}</span><small>{new Date(x.date).toLocaleDateString('ru-RU')}</small></div><strong>{x.amount>0?'+':''}{x.amount.toLocaleString('ru-RU')}</strong></div>):<p className="authhint">Операций пока нет.</p>}</CustomerSheet>}<div className="profile-menu-stack">{loyalty?.linked&&<section className="profile-utilities menu-list">
 <MenuRow icon={<RefreshCw size={23}/>} opensDialog onClick={()=>{onHistoryOpen?.();void loadBonus(true)}}>История бонусов</MenuRow>
 </section>}{children}<section className="profile-utilities menu-list profile-account-actions"><MenuRow icon={<KeyRound size={23}/>} onClick={()=>{clear();setChangeLeaving(false);setMode('change')}}>Сменить пароль</MenuRow><MenuRow className="profile-logout" opensDialog icon={<LogOut size={23}/>} disabled={busy} onClick={openLogoutDialog}>Выйти из аккаунта</MenuRow><dialog ref={logoutDialog} className="profile-logout-dialog" role="alertdialog" aria-labelledby="profile-logout-title">
 <form onSubmit={confirmLogout}>
  <h2 id="profile-logout-title">Вы точно хотите выйти из профиля?</h2>
  <div className="profile-logout-choices">
   <button type="button" ref={cancelLogout} onClick={()=>logoutDialog.current?.close()}>Нет</button>
   <button type="submit">Да</button>
  </div>
 </form>
 </dialog>{error&&<p className="autherror" role="alert">{error}</p>}</section></div></>:<div className="authlayout authlayout--native"><section className="authcard authcard--native"><div className="authtabs" role="group" aria-label="Режим авторизации"><button type="button" aria-pressed={mode==='login'} className={mode==='login'?'active':''} onClick={()=>{if(mode!=='login'){clear();setMode('login')}}}>Вход</button><button type="button" aria-pressed={mode==='register'} className={mode==='register'?'active':''} onClick={()=>{if(mode!=='register'){clear();setMode('register')}}}>Регистрация</button></div><form onSubmit={submit} noValidate>{mode==='register'&&<><AuthField id="register-last-name" label="Фамилия" autoComplete="family-name" required maxLength={80} value={lastName} onChange={e=>setLastName(e.target.value)}/><AuthField id="register-first-name" label="Имя" autoComplete="given-name" required maxLength={80} value={firstName} onChange={e=>setFirstName(e.target.value)}/><AuthField id="register-middle-name" label="Отчество" autoComplete="additional-name" maxLength={80} value={middleName} onChange={e=>setMiddleName(e.target.value)}/></>}<AuthField id="auth-phone" label="Номер телефона" prefixOnly={phone==='+7'} name="phone" type="tel" inputMode="tel" autoComplete="username" required pattern="[+]7 [0-9]{3} [0-9]{3}-[0-9]{2}-[0-9]{2}" title="+7 999 123-45-67" value={phone} onChange={changePhone}/><PasswordField key={mode} id="auth-password" label="Пароль" value={password} onChange={setPassword} creating={mode==='register'}/>{mode==='register'&&<><PasswordField id="register-confirmation" label="Повтори пароль" value={confirmation} onChange={setConfirmation} creating/><label className="authconsent"><input type="checkbox" checked={consent} required onChange={e=>setConsent(e.target.checked)}/><span>Согласен на обработку персональных данных согласно <a href="/privacy/" target="_blank" rel="noreferrer">политике конфиденциальности</a></span></label></>}<button className="blackbtn" disabled={busy}>{busy?'Подождите…':mode==='register'?'Зарегистрироваться':'Войти'}</button></form></section></div>}{authToast&&(!user||user.mustChangePassword||mode==='change')&&createPortal(<div className="auth-error-toast" role="alert">{authToast.message}</div>,document.body)}{!user&&children}</main>
}
