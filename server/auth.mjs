import {createServer} from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {randomBytes,randomInt,createHmac,createHash,timingSafeEqual} from 'node:crypto';

const digest = value => createHash('sha256').update(value).digest('hex');
export function normalizePhone(value){
 let n=String(value??'').replace(/[\s()+-]/g,'');
 if(/^8\d{10}$/.test(n))n='7'+n.slice(1);
 if(!/^7\d{10}$/.test(n))throw new ApiError(400,'Укажите номер в формате +7 999 123-45-67');
 return '+'+n;
}
class ApiError extends Error{constructor(status,message,retryAfter){super(message);this.status=status;this.retryAfter=retryAfter}}
export function createAuth({database,secret,origin,sendSms,loyalty,now=Date.now}){
 if(!secret||secret.length<32)throw new Error('AUTH_SECRET must contain at least 32 characters');
 const db=new DatabaseSync(database);db.exec(`PRAGMA journal_mode=WAL;
 CREATE TABLE IF NOT EXISTS challenges(id TEXT PRIMARY KEY,phone TEXT,hash TEXT,expires INTEGER,attempts INTEGER DEFAULT 0);
 CREATE TABLE IF NOT EXISTS customers(id TEXT PRIMARY KEY,phone TEXT UNIQUE,created INTEGER);
 CREATE TABLE IF NOT EXISTS sessions(hash TEXT PRIMARY KEY,customer TEXT,expires INTEGER);
 CREATE TABLE IF NOT EXISTS sends(ip TEXT,phone TEXT,created INTEGER);`);
 const run=(sql,...args)=>db.prepare(sql).run(...args);const get=(sql,...args)=>db.prepare(sql).get(...args);
 const codeHash=(id,code)=>createHmac('sha256',secret).update(id+':'+code).digest();
 const sessionCookie=value=>`__Host-sizey_session=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${value?2592000:0}`;
 const customer=req=>{
  const token=String(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('__Host-sizey_session='))?.split('=')[1];
  if(!token||!/^[a-f0-9]{64}$/.test(token))return null;
  return get('SELECT customers.id,customers.phone FROM sessions JOIN customers ON customers.id=sessions.customer WHERE sessions.hash=? AND sessions.expires>?',digest(token),now());
 };
 async function body(req){let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>2048)throw new ApiError(413,'Запрос слишком большой')};try{return JSON.parse(raw)}catch{throw new ApiError(400,'Некорректный запрос')}}
 const server=createServer(async(req,res)=>{
  const reply=(status,data,cookie)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...(cookie?{'Set-Cookie':cookie}:{})});res.end(JSON.stringify(data))};
  try{
   const path=new URL(req.url,'http://internal').pathname;
   if(req.method==='GET'&&path==='/hub-api/health')return reply(200,{ok:true,smsConfigured:!!sendSms});
   if(req.method==='POST'){
    if(req.headers.origin!==origin)throw new ApiError(403,'Недопустимый источник запроса');
    if(!String(req.headers['content-type']).startsWith('application/json'))throw new ApiError(415,'Ожидается JSON');
   }
   if(req.method==='POST'&&path==='/hub-api/auth/request-code'){
    if(!sendSms)throw new ApiError(503,'Вход по SMS пока недоступен. Попробуйте позже.');
    const input=await body(req);if(input.consent!==true)throw new ApiError(400,'Подтвердите согласие на обработку данных');
    const phone=normalizePhone(input.phone),time=now(),ip=String(req.headers['x-real-ip']||req.socket.remoteAddress);
    run('DELETE FROM sends WHERE created<?',time-86400000);run('DELETE FROM challenges WHERE expires<?',time);run('DELETE FROM sessions WHERE expires<?',time);
    const last=get('SELECT MAX(created) AS at FROM sends WHERE phone=?',phone)?.at;
    if(last!=null&&time-last<60000)throw new ApiError(429,'Повторить отправку можно через минуту',Math.ceil((60000-time+last)/1000));
    const phoneCount=get('SELECT COUNT(*) AS n FROM sends WHERE phone=? AND created>?',phone,time-3600000).n;
    const ipCount=get('SELECT COUNT(*) AS n FROM sends WHERE ip=? AND created>?',ip,time-3600000).n;
    const total=get('SELECT COUNT(*) AS n FROM sends').n;
    if(phoneCount>=3||ipCount>=10||total>=100)throw new ApiError(429,'Лимит отправки SMS. Попробуйте позже.',3600);
    run('INSERT INTO sends VALUES(?,?,?)',ip,phone,time);
    const id=randomBytes(24).toString('hex'),code=String(randomInt(100000,1000000));
    try{await sendSms(phone,code)}catch{throw new ApiError(503,'Не удалось отправить SMS. Попробуйте позже.')}
    run('DELETE FROM challenges WHERE phone=?',phone);
    run('INSERT INTO challenges(id,phone,hash,expires) VALUES(?,?,?,?)',id,phone,codeHash(id,code).toString('hex'),time+300000);
    return reply(200,{challengeId:id,expiresIn:300,retryAfter:60});
   }
   if(req.method==='POST'&&path==='/hub-api/auth/verify'){
    const input=await body(req),id=String(input.challengeId||'');
    const challenge=get('SELECT * FROM challenges WHERE id=?',id);
    if(!challenge||challenge.expires<=now()||challenge.attempts>=5)throw new ApiError(400,'Код истёк или недействителен. Запросите новый.');
    run('UPDATE challenges SET attempts=attempts+1 WHERE id=?',id);
    if(!/^\d{6}$/.test(String(input.code))||!timingSafeEqual(codeHash(id,String(input.code)),Buffer.from(challenge.hash,'hex')))throw new ApiError(400,'Неверный код');
    run('DELETE FROM challenges WHERE id=?',id);
    let user=get('SELECT id,phone FROM customers WHERE phone=?',challenge.phone);
    if(!user){user={id:randomBytes(16).toString('hex'),phone:challenge.phone};run('INSERT INTO customers VALUES(?,?,?)',user.id,user.phone,now())}
    const token=randomBytes(32).toString('hex');run('INSERT INTO sessions VALUES(?,?,?)',digest(token),user.id,now()+2592000000);
    return reply(200,{user},sessionCookie(token));
   }
   if(req.method==='POST'&&path==='/hub-api/auth/logout'){
    const token=String(req.headers.cookie||'').match(/(?:^|;\s*)__Host-sizey_session=([a-f0-9]{64})/)?.[1];
    if(token)run('DELETE FROM sessions WHERE hash=?',digest(token));return reply(200,{ok:true},sessionCookie(''));
   }
   if(req.method==='GET'&&path==='/hub-api/auth/me'){const user=customer(req);return reply(user?200:401,user?{user}:{message:'Требуется вход'})}
   if(req.method==='GET'&&path==='/hub-api/loyalty'){
    const user=customer(req);if(!user)throw new ApiError(401,'Требуется вход');
    if(!loyalty)throw new ApiError(503,'Бонусная система временно недоступна');
    // Phone is always read from the verified server session, never a query parameter.
    return reply(200,await loyalty(user.phone));
   }
   reply(404,{message:'Не найдено'});
  }catch(e){if(e.retryAfter)res.setHeader('Retry-After',String(e.retryAfter));reply(e instanceof ApiError?e.status:500,{message:e instanceof ApiError?e.message:'Сервис временно недоступен'})}
 });
 return {server,close:()=>db.close()};
}
export function smsRu(apiId){return async(phone,code)=>{
 const response=await fetch('https://sms.ru/sms/send',{method:'POST',signal:AbortSignal.timeout(15000),body:new URLSearchParams({api_id:apiId,to:phone.slice(1),msg:`SIZEY: код входа ${code}. Не сообщайте его никому.`,json:'1'})});
 const result=await response.json();if(!response.ok||result.status_code!==100||result.sms?.[phone.slice(1)]?.status_code!==100)throw new Error('SMS delivery rejected');
}}
