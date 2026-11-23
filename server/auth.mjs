import {createServer} from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {randomBytes,createHash,createHmac,createCipheriv,createDecipheriv} from 'node:crypto';
import {hashPassword,verifyPassword,validPassword,temporaryPassword} from './passwords.mjs';

export const digest=value=>createHash('sha256').update(value).digest('hex');
export class ApiError extends Error{constructor(status,message,retryAfter){super(message);this.status=status;this.retryAfter=retryAfter}}
export function normalizePhone(value){let n=String(value??'').replace(/[\s()+-]/g,'');if(/^8\d{10}$/.test(n))n='7'+n.slice(1);if(!/^7\d{10}$/.test(n))throw new ApiError(400,'Укажите номер в формате +7 999 123-45-67');return '+'+n}
export function credentialEnvelope(secret){
 const key=createHash('sha256').update('SIZEY temporary credentials v1:'+secret).digest();
 return{seal(value){const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',key,iv);return Buffer.concat([iv,c.update(value,'utf8'),c.final(),c.getAuthTag()]).toString('base64')},open(value){const b=Buffer.from(value,'base64'),d=createDecipheriv('aes-256-gcm',key,b.subarray(0,12));d.setAuthTag(b.subarray(-16));return Buffer.concat([d.update(b.subarray(12,-16)),d.final()]).toString('utf8')}};
}
export function initializeDatabase(database){
 const db=new DatabaseSync(database);db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
 CREATE TABLE IF NOT EXISTS customers(id TEXT PRIMARY KEY,phone TEXT UNIQUE,created INTEGER);
 CREATE TABLE IF NOT EXISTS sessions(hash TEXT PRIMARY KEY,customer TEXT,expires INTEGER);
 CREATE TABLE IF NOT EXISTS credentials(customer TEXT PRIMARY KEY REFERENCES customers(id),password_hash TEXT NOT NULL,must_change INTEGER NOT NULL DEFAULT 0,phone_verified INTEGER NOT NULL DEFAULT 0,temporary_encrypted TEXT,issued_at INTEGER);
 CREATE TABLE IF NOT EXISTS auth_attempts(kind TEXT,subject TEXT,created INTEGER);
 CREATE TABLE IF NOT EXISTS credential_audit(employee TEXT,customer TEXT,action TEXT,created INTEGER);
 CREATE INDEX IF NOT EXISTS auth_attempts_lookup ON auth_attempts(kind,subject,created);`);return db;
}
export function createAuth({database,secret,origin,orderStore,loyalty,listLoyaltyCustomers,getLoyaltyClient,staffAuth,adminHandler,push,now=Date.now}){
 if(!secret||secret.length<32)throw new Error('AUTH_SECRET must contain at least 32 characters');
 const db=initializeDatabase(database),envelope=credentialEnvelope(secret),staffSessions=new Map();let passwordJobs=0;
 const run=(s,...a)=>db.prepare(s).run(...a),get=(s,...a)=>db.prepare(s).get(...a),all=(s,...a)=>db.prepare(s).all(...a);
 const token=()=>randomBytes(32).toString('hex');
 const cookie=(name,value,age)=>`${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`;
 const readCookie=(req,name)=>String(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(name+'='))?.split('=')[1];
 const publicUser=u=>({id:u.id,phone:u.phone,mustChangePassword:!!u.must_change,phoneVerified:!!u.phone_verified});
 const findUser=phone=>get('SELECT c.id,c.phone,k.* FROM customers c LEFT JOIN credentials k ON k.customer=c.id WHERE c.phone=?',phone);
 const current=req=>{const t=readCookie(req,'__Host-sizey_session');if(!t||!/^[a-f0-9]{64}$/.test(t))return null;return get('SELECT c.id,c.phone,k.* FROM sessions s JOIN customers c ON c.id=s.customer JOIN credentials k ON k.customer=c.id WHERE s.hash=? AND s.expires>?',digest(t),now())};
 const session=user=>{const t=token();run('INSERT INTO sessions VALUES(?,?,?)',digest(t),user.id,now()+2592000000);return cookie('__Host-sizey_session',t,2592000)};
 const ip=req=>String(req.headers['x-real-ip']||req.socket.remoteAddress);
 function limit(kind,subject,max,window){run('DELETE FROM auth_attempts WHERE created<?',now()-86400000);if(get('SELECT COUNT(*) AS n FROM auth_attempts WHERE kind=? AND subject=? AND created>?',kind,subject,now()-window).n>=max)throw new ApiError(429,'Слишком много попыток. Попробуйте позже.',Math.ceil(window/1000));run('INSERT INTO auth_attempts VALUES(?,?,?)',kind,subject,now())}
 async function passwordWork(fn){if(passwordJobs>=4)throw new ApiError(429,'Сервис занят. Попробуйте через минуту.',60);passwordJobs++;try{return await fn()}finally{passwordJobs--}}
 async function body(req){let raw='';for await(const c of req){raw+=c;if(Buffer.byteLength(raw)>4096)throw new ApiError(413,'Запрос слишком большой')}try{const b=JSON.parse(raw);if(!b||typeof b!=='object'||Array.isArray(b))throw Error();return b}catch{throw new ApiError(400,'Некорректный запрос')}}
 async function employee(req,bearerAllowed=false){
  if(bearerAllowed&&req.headers.authorization){
   const match=/^Bearer ([A-Za-z0-9._~-]{1,8192})$/.exec(String(req.headers.authorization));
   if(!match||!staffAuth)throw new ApiError(401,'Требуется вход сотрудника');
   let me;try{me=await staffAuth.me(match[1])}catch{throw new ApiError(401,'Сессия сотрудника истекла. Войдите снова.')}
   if(!me?.id||!['ADMIN','CASHIER'].includes(me.role)||(me.status&&me.status!=='ACTIVE'))throw new ApiError(403,'Доступ только сотрудникам');
   return me;
  }
  const t=readCookie(req,'__Host-sizey_staff'),s=t&&staffSessions.get(digest(t));if(!s||s.expires<=now()||!staffAuth)throw new ApiError(401,'Войдите как сотрудник');let me;try{me=await staffAuth.me(s.accessToken)}catch{staffSessions.delete(digest(t));throw new ApiError(401,'Сессия сотрудника истекла. Войдите снова.')}if(!me?.id||!me.role||(me.status&&me.status!=='ACTIVE'))throw new ApiError(403,'Доступ только сотрудникам');return me}
 async function issueToCustomer(me,user,allowCreate=false){
  let password,hash=user.password_hash;
  if(user.temporary_encrypted)password=envelope.open(user.temporary_encrypted);else{password=temporaryPassword();hash=await passwordWork(()=>hashPassword(password))}
  db.exec('BEGIN');try{
   const fresh=findUser(user.phone);
   if(!fresh&&allowCreate)run('INSERT INTO customers VALUES(?,?,?)',user.id,user.phone,now());
   else if(!fresh||fresh.password_hash!==user.password_hash||fresh.temporary_encrypted!==user.temporary_encrypted)throw new ApiError(409,'Данные уже изменены. Обновите страницу.');
   run('INSERT INTO credentials(customer,password_hash,must_change,phone_verified,issued_at) VALUES(?,?,1,1,?) ON CONFLICT(customer) DO UPDATE SET password_hash=excluded.password_hash,must_change=1,phone_verified=1,temporary_encrypted=NULL,issued_at=excluded.issued_at',user.id,hash,now());
   run('DELETE FROM sessions WHERE customer=?',user.id);run('INSERT INTO credential_audit VALUES(?,?,?,?)',me.id,user.id,'issue-temporary-password',now());db.exec('COMMIT');
  }catch(e){db.exec('ROLLBACK');throw e}
  return{phone:user.phone,temporaryPassword:password,mustChangePassword:true};
 }
 const proofWindow=()=>Math.floor(now()/300000);
 const proofCode=(sessionHash,window)=>String(createHmac('sha256',secret)
  .update('loyalty-phone-proof:'+sessionHash+':'+window).digest().readUInt32BE()%100000000).padStart(8,'0');
 async function customerAccess(me,clientId,confirmation,allowConfirmation=false){
  if(!getLoyaltyClient)throw new ApiError(503,'Связь с бонусной системой временно недоступна');
  const client=await getLoyaltyClient(clientId);
  if(!client)throw new ApiError(404,'Клиент не найден');
  const phone=normalizePhone(client.phone_normalized),user=findUser(phone);
  const canConfirm=!!user?.password_hash&&!user.must_change&&!user.phone_verified;
  if(!confirmation)return{...(allowConfirmation?{hasPassword:!!user?.password_hash,canConfirm}:{}),exists:!!user,phone,phoneVerified:!!user?.phone_verified,temporaryPasswordPending:!!user?.temporary_encrypted,mustChangePassword:!!user?.must_change,issued:!!user?.issued_at};
  limit('staff-issue',me.id,50,3600000);
  if(confirmation.identityChecked!==true)throw new ApiError(400,'Подтвердите проверку клиента');
  if(typeof confirmation.expectedPhone!=='string'||normalizePhone(confirmation.expectedPhone)!==phone)throw new ApiError(409,'Телефон клиента изменился. Обновите карточку и проверьте клиента заново.');
  if(allowConfirmation&&canConfirm){
   const code=confirmation.verificationCode;
   if(typeof code!=='string'||!/^\d{8}$/.test(code))throw new ApiError(400,'Укажите код из профиля клиента');
   const window=proofWindow();
   const sessions=all('SELECT hash FROM sessions WHERE customer=? AND expires>?',user.id,now());
   if(!sessions.some(session=>code===proofCode(session.hash,window)||code===proofCode(session.hash,window-1)))
    throw new ApiError(400,'Код неверный или устарел. Обновите профиль клиента.');
   db.exec('BEGIN');
   try{
    const updated=run('UPDATE credentials SET phone_verified=1 WHERE customer=? AND phone_verified=0 AND must_change=0 AND password_hash=?',user.id,user.password_hash);
    if(!updated.changes)throw new ApiError(409,'Данные уже изменены. Обновите карточку.');
    run('INSERT INTO credential_audit VALUES(?,?,?,?)',me.id,user.id,'confirm-loyalty-phone',now());
    db.exec('COMMIT');
   }catch(error){db.exec('ROLLBACK');throw error}
   return{phoneVerified:true};
  }
  if(confirmation.verificationCode!==undefined)throw new ApiError(409,'Статус номера изменился. Обновите карточку клиента.');
  return issueToCustomer(me,user||{id:randomBytes(16).toString('hex'),phone,password_hash:null,temporary_encrypted:null},!user);
 }
 const server=createServer(async(req,res)=>{
  const reply=(status,data,setCookie)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...(setCookie?{'Set-Cookie':setCookie}:{})});res.end(JSON.stringify(data))};
  try{
   const path=new URL(req.url,'http://internal').pathname;
   if(adminHandler&&await adminHandler(req,res,(me,id,confirmation)=>customerAccess(me,id,confirmation,true)))return;
   if(req.method==='GET'&&path==='/hub-api/health')return reply(200,{ok:true,authMethod:'password',loyaltyConfigured:!!loyalty,employeeCabinetIntegration:!!getLoyaltyClient});
   if(req.method==='POST'){if(req.headers.origin!==origin)throw new ApiError(403,'Недопустимый источник запроса');if(!String(req.headers['content-type']).startsWith('application/json'))throw new ApiError(415,'Ожидается JSON')}
   if(req.method==='POST'&&path==='/hub-api/auth/register'){
    limit('register-ip',ip(req),5,3600000);const b=await body(req),phone=normalizePhone(b.phone);
    if(b.consent!==true)throw new ApiError(400,'Подтвердите согласие на обработку данных');
    if(!validPassword(b.password))throw new ApiError(400,'Пароль должен содержать от 10 до 128 символов');
    if(findUser(phone))throw new ApiError(409,'Номер уже зарегистрирован. Войдите или получите пароль у сотрудника магазина.');
    // Do not let self-registration claim an existing loyalty record added since import.
    if(!loyalty)throw new ApiError(503,'Регистрация временно недоступна');
    let existing;try{existing=await loyalty(phone)}catch{throw new ApiError(503,'Регистрация временно недоступна')}
    if(existing.linked)throw new ApiError(409,'Номер уже зарегистрирован. Получите пароль у сотрудника магазина.');
    const hash=await passwordWork(()=>hashPassword(b.password)),id=randomBytes(16).toString('hex');
    db.exec('BEGIN');try{if(findUser(phone))throw new ApiError(409,'Номер уже зарегистрирован');run('INSERT INTO customers VALUES(?,?,?)',id,phone,now());run('INSERT INTO credentials(customer,password_hash) VALUES(?,?)',id,hash);db.exec('COMMIT')}catch(e){db.exec('ROLLBACK');throw e}
    const user=findUser(phone);return reply(201,{user:publicUser(user)},session(user));
   }
   if(req.method==='POST'&&path==='/hub-api/auth/login'){
    const b=await body(req);limit('login-ip',ip(req),30,900000);const phone=normalizePhone(b.phone);limit('login-phone',phone,10,900000);
    const user=findUser(phone);
    // Equal-cost dummy verification for unknown or not-yet-provisioned accounts.
    const hash=user?.password_hash||'scrypt-v1$00000000000000000000000000000000$'+'00'.repeat(64);
    const valid=await passwordWork(()=>verifyPassword(b.password,hash));
    if(!valid||!user?.password_hash||findUser(phone)?.password_hash!==hash)throw new ApiError(401,'Неверный номер телефона или пароль');
    return reply(200,{user:publicUser(user)},session(user));
   }
   if(req.method==='POST'&&path==='/hub-api/auth/change-password'){
    const user=current(req);if(!user)throw new ApiError(401,'Требуется вход');limit('change-password',user.id,10,900000);const b=await body(req);
    if(!validPassword(b.newPassword))throw new ApiError(400,'Новый пароль должен содержать от 10 до 128 символов');
    if(b.newPassword===b.currentPassword)throw new ApiError(400,'Новый пароль должен отличаться от текущего');
    const hash=await passwordWork(async()=>{if(!await verifyPassword(b.currentPassword,user.password_hash))throw new ApiError(401,'Неверный текущий пароль');return hashPassword(b.newPassword)});
    db.exec('BEGIN');let newCookie;try{const result=run('UPDATE credentials SET password_hash=?,must_change=0,temporary_encrypted=NULL WHERE customer=? AND password_hash=?',hash,user.id,user.password_hash);if(!result.changes)throw new ApiError(409,'Пароль уже изменён. Войдите снова.');run('DELETE FROM sessions WHERE customer=?',user.id);newCookie=session(user);db.exec('COMMIT')}catch(e){db.exec('ROLLBACK');throw e}
    return reply(200,{user:publicUser(findUser(user.phone))},newCookie);
   }
   if(req.method==='POST'&&path==='/hub-api/auth/logout'){const t=readCookie(req,'__Host-sizey_session');if(t)run('DELETE FROM sessions WHERE hash=?',digest(t));return reply(200,{ok:true},cookie('__Host-sizey_session','',0))}
   if(path==='/hub-api/notifications'&&req.method==='GET'){
    const user=current(req);if(!user)throw new ApiError(401,'Требуется вход');
    return reply(200,{notifications:push?.inbox(user.id)||[]});
   }
   if(path==='/hub-api/notifications/read'&&req.method==='POST'){
    const user=current(req);if(!user)throw new ApiError(401,'Требуется вход');
    const data=await body(req);
    if(typeof data.id!=='string'||!/^[a-f0-9-]{36}$/i.test(data.id))throw new ApiError(400,'Некорректное уведомление');
    push?.markRead(user.id,data.id);
    return reply(200,{ok:true});
   }
   if(path==='/hub-api/notifications/bind'&&req.method==='POST'){
    const user=current(req);if(!user)throw new ApiError(401,'Требуется вход');
    if(!push)throw new ApiError(503,'Уведомления недоступны');
    const data=await body(req);
    return reply(200,{bound:push.bind(user.id,data)});
   }
   if(req.method==='POST'&&path==='/hub-api/orders'){
    if(!orderStore)throw new ApiError(503,'Оформление заказов временно недоступно');
    limit('order-ip',ip(req),10,3600000);
    const customer=current(req);
    const data=await body(req);
    const result=orderStore.createOrder(data,customer?publicUser(customer):null);
    return reply(201,{order:result});
   }
   if(req.method==='GET'&&path==='/hub-api/auth/me'){const user=current(req);return reply(user?200:401,user?{user:publicUser(user)}:{message:'Требуется вход'})}
   if(req.method==='GET'&&path==='/hub-api/loyalty'){
    const user=current(req);if(!user)throw new ApiError(401,'Требуется вход');if(user.must_change)throw new ApiError(403,'Сначала смените временный пароль');
    if(!user.phone_verified){
     const sessionHash=digest(readCookie(req,'__Host-sizey_session'));
     return reply(200,{linked:false,pendingVerification:true,verificationCode:proofCode(sessionHash,proofWindow()),balance:null,history:[]});
    }
    if(!loyalty)throw new ApiError(503,'Бонусная система временно недоступна');return reply(200,await loyalty(user.phone));
   }
   if(req.method==='POST'&&path==='/hub-api/staff/login'){
    limit('staff-login',ip(req),10,900000);if(!staffAuth)throw new ApiError(503,'Вход сотрудников временно недоступен');const b=await body(req);
    if(typeof b.login!=='string'||typeof b.password!=='string'||b.login.length>128||b.password.length>256)throw new ApiError(400,'Укажите логин и пароль сотрудника');
    let login;try{login=await staffAuth.login(b.login,b.password)}catch{throw new ApiError(401,'Не удалось войти. Проверьте логин и пароль сотрудника.')}
    if(!login?.accessToken||!login.user?.id||!login.user.role||(login.user.status&&login.user.status!=='ACTIVE'))throw new ApiError(403,'Доступ только сотрудникам');
    const t=token();for(const[k,v]of staffSessions)if(v.expires<=now())staffSessions.delete(k);
    staffSessions.set(digest(t),{accessToken:login.accessToken,expires:now()+900000});return reply(200,{user:{name:login.user.name,role:login.user.role}},cookie('__Host-sizey_staff',t,900));
   }
   if(req.method==='POST'&&path==='/hub-api/staff/logout'){const t=readCookie(req,'__Host-sizey_staff');if(t)staffSessions.delete(digest(t));return reply(200,{ok:true},cookie('__Host-sizey_staff','',0))}
   if(req.method==='GET'&&path==='/hub-api/staff/customers'){
    const me=await employee(req);if(!listLoyaltyCustomers)throw new ApiError(503,'Бонусная система временно недоступна');
    const list=await listLoyaltyCustomers(),local=all('SELECT c.id,c.phone,k.must_change,k.temporary_encrypted,k.issued_at FROM customers c LEFT JOIN credentials k ON k.customer=c.id');
    const names=new Map(list.map(c=>['+'+c.phone_normalized,c.name]));
    // No password or hash is returned in list responses.
    return reply(200,{employee:{name:me.name,role:me.role},customers:local.map(c=>({id:c.id,phone:c.phone,name:names.get(c.phone)||'Новый аккаунт SIZEY',temporaryPasswordPending:!!c.temporary_encrypted,mustChangePassword:!!c.must_change,issued:!!c.issued_at}))});
   }
   const cabinetRoute=/^\/hub-api\/staff\/clients\/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\/(access|issue)$/i.exec(path);
   if(cabinetRoute&&((req.method==='GET'&&cabinetRoute[2]==='access')||(req.method==='POST'&&cabinetRoute[2]==='issue'))){
    const me=await employee(req,true);
    return reply(200,await customerAccess(me,cabinetRoute[1],req.method==='POST'?await body(req):undefined));
   }
   if(req.method==='POST'&&path==='/hub-api/staff/issue-password'){
    const me=await employee(req);limit('staff-issue',me.id,50,3600000);const b=await body(req);if(b.identityChecked!==true)throw new ApiError(400,'Подтвердите проверку клиента');
    const phone=normalizePhone(b.phone),user=findUser(phone);if(!user)throw new ApiError(404,'Аккаунт не найден');
    return reply(200,await issueToCustomer(me,user));
   }
   reply(404,{message:'Не найдено'});
  }catch(e){if(e.retryAfter)res.setHeader('Retry-After',String(e.retryAfter));reply(e instanceof ApiError?e.status:500,{message:e instanceof ApiError?e.message:'Сервис временно недоступен'})}
 });return{server,close:()=>db.close()};
}
