import {createHash,randomBytes} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {ContentError,storeImage} from './content-store.mjs';
export function createAdmin({store,analytics,staffAuth,listClients,mediaDirectory,origin='https://admmm.sizey.ru',eventOrigin='https://hub.sizey.ru',now=Date.now}){
 const ingestRates=new Map();
 const sessions=new Map(),attempts=new Map(),hash=value=>createHash('sha256').update(value).digest('hex');
 const cookie=(value,age)=>`__Host-sizey_admin=${value}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${age}`;
 const token=req=>String(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('__Host-sizey_admin='))?.split('=')[1];
 async function body(req,limit=32768){let size=0,parts=[];for await(const part of req){size+=part.length;if(size>limit)throw new ContentError(413,'Запрос слишком большой');parts.push(part)}try{const data=JSON.parse(Buffer.concat(parts).toString());if(!data||typeof data!=='object'||Array.isArray(data))throw Error();return data}catch{throw new ContentError(400,'Некорректные данные')}}
 async function actor(req){const sid=token(req),session=sid&&sessions.get(hash(sid));if(!session||session.expires<=now())throw new ContentError(401,'Войдите в панель управления');let user;try{user=await staffAuth.me(session.accessToken)}catch{sessions.delete(hash(sid));throw new ContentError(401,'Сессия завершилась. Войдите снова.')}if(user.role!=='ADMIN'||user.status&&user.status!=='ACTIVE')throw new ContentError(403,'Доступ только администратору');return user}
 return async(req,res)=>{
  const path=new URL(req.url,'http://internal').pathname;
  if(path!=='/hub-api/events'&&path!=='/hub-api/content'&&!path.startsWith('/hub-api/admin/')&&!path.startsWith('/hub-api/media/'))return false;
  const reply=(status,data,setCookie)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...(setCookie?{'Set-Cookie':setCookie}:{})});res.end(JSON.stringify(data))};
  try{
   if(path==='/hub-api/events'){
    if(!analytics)throw new ContentError(503,'Аналитика не подключена');
    if(req.method!=='POST')throw new ContentError(405,'Метод не поддерживается');
    if(req.headers.origin!==eventOrigin)throw new ContentError(403,'Недопустимый источник запроса');
    if(!String(req.headers['content-type']).startsWith('application/json'))throw new ContentError(415,'Ожидается JSON');
    const key=hash(String(req.headers['x-real-ip']||req.socket.remoteAddress)),minute=Math.floor(now()/60000);
    const rate=ingestRates.get(key);if(rate?.minute===minute&&rate.count>=120)throw new ContentError(429,'Слишком много событий');
    if(rate?.minute===minute)rate.count++;else ingestRates.set(key,{minute,count:1});
    if(ingestRates.size>10000)for(const[k,v]of ingestRates)if(v.minute!==minute)ingestRates.delete(k);
    reply(202,{accepted:analytics.collect(await body(req),{ip:String(req.headers['x-real-ip']||req.socket.remoteAddress)})});return true;
   }
   if(path==='/hub-api/content'&&req.method==='GET'){reply(200,store.publicContent());return true}
   if(path.startsWith('/hub-api/media/')&&req.method==='GET'){const name=path.slice('/hub-api/media/'.length);if(!/^[a-f0-9]{64}\.(jpg|png|webp)$/.test(name))throw new ContentError(404,'Фотография не найдена');let data;try{data=readFileSync(join(mediaDirectory,name))}catch{throw new ContentError(404,'Фотография не найдена')}res.writeHead(200,{'Content-Type':name.endsWith('.jpg')?'image/jpeg':name.endsWith('.png')?'image/png':'image/webp','Cache-Control':'public, max-age=31536000, immutable','X-Content-Type-Options':'nosniff'});res.end(data);return true}
   if(req.method==='POST'){if(req.headers.origin!==origin)throw new ContentError(403,'Недопустимый источник запроса');if(!String(req.headers['content-type']).startsWith('application/json'))throw new ContentError(415,'Ожидается JSON')}
   if(path==='/hub-api/admin/login'&&req.method==='POST'){
    const key=String(req.headers['x-real-ip']||req.socket.remoteAddress),list=(attempts.get(key)||[]).filter(t=>t>now()-900000);if(list.length>=10)throw new ContentError(429,'Слишком много попыток входа. Попробуйте позже.');list.push(now());attempts.set(key,list);for(const[k,v]of attempts)if(v.every(t=>t<=now()-900000))attempts.delete(k);
    const b=await body(req);if(typeof b.login!=='string'||typeof b.password!=='string'||b.login.length>128||b.password.length>256)throw new ContentError(400,'Укажите логин и пароль');let login;try{login=await staffAuth.login(b.login,b.password)}catch{throw new ContentError(401,'Неверный логин или пароль')};if(!login.accessToken||login.user?.role!=='ADMIN'||login.user.status&&login.user.status!=='ACTIVE')throw new ContentError(403,'Доступ только администратору');const sid=randomBytes(32).toString('hex');for(const[k,v]of sessions)if(v.expires<=now())sessions.delete(k);sessions.set(hash(sid),{accessToken:login.accessToken,expires:now()+900000});reply(200,{user:{id:login.user.id,name:login.user.name,role:'ADMIN'}},cookie(sid,900));return true;
   }
   if(path==='/hub-api/admin/session'&&req.method==='POST'){
    const match=/^Bearer ([A-Za-z0-9._~-]{1,8192})$/.exec(String(req.headers.authorization||''));if(!match)throw new ContentError(401,'Требуется вход сотрудника');let user;try{user=await staffAuth.me(match[1])}catch{throw new ContentError(401,'Сессия завершилась')};if(user.role!=='ADMIN'||user.status&&user.status!=='ACTIVE')throw new ContentError(403,'Доступ только администратору');const sid=randomBytes(32).toString('hex');sessions.set(hash(sid),{accessToken:match[1],expires:now()+900000});reply(200,{user:{id:user.id,name:user.name,role:user.role}},cookie(sid,900));return true;
   }
   if(path==='/hub-api/admin/logout'&&req.method==='POST'){const sid=token(req);if(sid)sessions.delete(hash(sid));reply(200,{ok:true},cookie('',0));return true}
   const user=await actor(req);
   if(req.method==='GET'&&path==='/hub-api/admin/me')reply(200,{user:{id:user.id,name:user.name,role:user.role}});
   else if(req.method==='GET'&&path==='/hub-api/admin/analytics'){
    if(!analytics)throw new ContentError(503,'Аналитика не подключена');
    const params=new URL(req.url,'http://internal').searchParams,days=Number(params.get('days')||30),report=analytics.report(days,params.has('from')||params.has('to')?{from:params.get('from'),to:params.get('to')}:undefined),catalog=new Map(store.list('products').map(p=>[p.id,p]));
    reply(200,{...report,products:report.products.map(p=>({...p,name:catalog.get(p.id)?.name||'Товар #'+p.id,img:catalog.get(p.id)?.img||'/brand/logo.svg'}))});
   }
   else if(req.method==='GET'&&path==='/hub-api/admin/summary')reply(200,{...store.summary(),clients:(await listClients()).length});
   else if(req.method==='GET'&&path==='/hub-api/admin/clients')reply(200,{clients:(await listClients()).map(c=>({id:c.id,name:c.name,phone:'+'+c.phone_normalized,loyalty:c.hasLoyalty!==false}))});
   else if(req.method==='GET'&&path==='/hub-api/admin/orders')reply(200,{orders:store.orders()});
   else if(req.method==='GET'&&path==='/hub-api/admin/activity')reply(200,{activity:store.summary().recent});
   else if(req.method==='POST'&&path==='/hub-api/admin/images'){const value=storeImage(mediaDirectory,await body(req,4300000));store.audit(user.id,'upload-image',value.split('/').pop());reply(201,{url:value})}
   else {const match=/^\/hub-api\/admin\/(products|banners)(?:\/([\w-]+))?$/.exec(path);if(!match)throw new ContentError(404,'Раздел не найден');const kind=match[1],id=match[2];if(req.method==='GET'&&!id)reply(200,{[kind]:store.list(kind)});else if(req.method==='POST'){const b=await body(req);reply(id?200:201,{item:store.save(kind,b,user.id,kind==='products'&&id?Number(id):id)})}else throw new ContentError(405,'Метод не поддерживается')}
  }catch(error){reply(error instanceof ContentError?error.status:500,{message:error instanceof ContentError?error.message:'Не удалось выполнить запрос. Попробуйте позже.'})}
  return true;
 };
}
