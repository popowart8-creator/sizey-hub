import {createHash,randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import webPush from 'web-push';
import {ContentError} from './content-store.mjs';

const uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const destinations=new Set(['/', '/?tab=catalog', '/?tab=cart', '/?tab=favorites', '/?tab=profile', '/?tab=wardrobe', '/?blog=1']);
export function validPushPath(path){
 if(typeof path!=='string'||path.length>1024||!path.startsWith('/')||path.startsWith('//')||path.includes('\\')||/[\u0000-\u001f\u007f]/.test(path))return false;
 try{const url=new URL(path,'https://hub.sizey.ru');return url.origin==='https://hub.sizey.ru'&&url.username===''&&url.password===''&&url.pathname==='/'&&(destinations.has(path)||url.searchParams.has('product')||url.searchParams.has('blog')||url.searchParams.has('tab'))}catch{return false}
}
const ttl=86400;
const hash=value=>createHash('sha256').update(value).digest('hex');
const validKey=(value,length)=>typeof value==='string'&&/^[A-Za-z0-9_-]+$/.test(value)&&Buffer.from(value,'base64url').length===length;

function subscription(data){
 const {endpoint,keys}=data;
 let url;
 try{if(typeof endpoint!=='string'||endpoint.length>2048)throw Error();url=new URL(endpoint)}catch{throw new ContentError(400,'Некорректная подписка')}

 const host=url.hostname;
 const supported=host==='fcm.googleapis.com'||host==='updates.push.services.mozilla.com'||host==='web.push.apple.com'||host.endsWith('.push.apple.com')||host==='wns.windows.com'||host.endsWith('.notify.windows.com');
 if(!supported||url.protocol!=='https:'||url.port||url.username||url.password||url.hash||url.pathname==='/')
  throw new ContentError(400,'Этот сервис уведомлений не поддерживается');
 if(!validKey(keys?.auth,16)||!validKey(keys?.p256dh,65)||Buffer.from(keys.p256dh,'base64url')[0]!==4)
  throw new ContentError(400,'Некорректные ключи подписки');
 return {endpoint:url.href,keys:{auth:keys.auth,p256dh:keys.p256dh}};
}

export function createPushStore(file,{now=Date.now,send=(...args)=>webPush.sendNotification(...args),subject='mailto:info@sizey.ru'}={}){
 const db=new DatabaseSync(file);
 db.exec(`PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;
 CREATE TABLE IF NOT EXISTS push_config(id INTEGER PRIMARY KEY CHECK(id=1), keys TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS push_subscriptions(id TEXT PRIMARY KEY, data TEXT NOT NULL, analytics INTEGER NOT NULL, created INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS push_inbox(id TEXT PRIMARY KEY, customer TEXT NOT NULL, campaign TEXT NOT NULL, title TEXT NOT NULL, message TEXT NOT NULL, path TEXT NOT NULL, created INTEGER NOT NULL, read INTEGER NOT NULL DEFAULT 0);
 CREATE INDEX IF NOT EXISTS push_inbox_customer ON push_inbox(customer,created DESC);
 CREATE TABLE IF NOT EXISTS push_campaigns(id TEXT PRIMARY KEY, title TEXT NOT NULL, message TEXT NOT NULL, path TEXT NOT NULL, actor TEXT NOT NULL, created INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS push_deliveries(id TEXT PRIMARY KEY, campaign TEXT NOT NULL REFERENCES push_campaigns(id) ON DELETE CASCADE, subscriber TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'queued', attempted INTEGER, shown INTEGER, opened INTEGER);
 CREATE INDEX IF NOT EXISTS push_delivery_campaign ON push_deliveries(campaign);
 CREATE INDEX IF NOT EXISTS push_delivery_queue ON push_deliveries(state);
 CREATE INDEX IF NOT EXISTS push_campaign_date ON push_campaigns(created);`);
const columns=db.prepare('PRAGMA table_info(push_subscriptions)').all().map(row=>row.name);
 if(!columns.includes('customer'))db.exec('ALTER TABLE push_subscriptions ADD COLUMN customer TEXT');
 let config=db.prepare('SELECT keys FROM push_config WHERE id=1').get();
 if(!config){
  db.prepare('INSERT OR IGNORE INTO push_config VALUES (1,?)').run(JSON.stringify(webPush.generateVAPIDKeys()));
  config=db.prepare('SELECT keys FROM push_config WHERE id=1').get();
 }
 const vapidDetails={subject,...JSON.parse(config.keys)};
 const find=db.prepare('SELECT data,analytics FROM push_subscriptions WHERE id=?');
 const remove=db.prepare('DELETE FROM push_subscriptions WHERE id=? AND data=?');
 const next=db.prepare(`UPDATE push_deliveries SET state='sending', attempted=?
   WHERE id=(SELECT id FROM push_deliveries WHERE state='queued' ORDER BY rowid LIMIT 1)
   RETURNING id,campaign,subscriber`);
 const finish=db.prepare('UPDATE push_deliveries SET state=? WHERE id=?');
 const bind=db.prepare('UPDATE push_subscriptions SET customer=? WHERE id=? AND data=?');
 const getCampaign=db.prepare('SELECT title,message,path,created FROM push_campaigns WHERE id=?');
 let running;
 async function worker(){
  for(let row;(row=next.get(now()));){
   const saved=find.get(row.subscriber),campaign=getCampaign.get(row.campaign);
   if(!saved||campaign.created+ttl*1000<now()){finish.run('skipped',row.id);continue}
   let state='accepted';
   try{
    await send(JSON.parse(saved.data),JSON.stringify({
     title:campaign.title,body:campaign.message,path:campaign.path,...(saved.analytics?{id:row.id}:{})
    }),{vapidDetails,TTL:ttl,timeout:10000});
   }catch(error){
    if(error.statusCode===404||error.statusCode===410)remove.run(row.subscriber,saved.data);
    state='failed';
   }
   finish.run(state,row.id);
  }
 }
 function drain(){
  if(!running)running=Promise.all(Array.from({length:8},()=>worker())).finally(()=>{running=undefined});
  return running;
 }
 function enqueue(data,actor){
  const {id,path}=data;
  const audience=data.audience||'all';
  if(!['all','selected','group'].includes(audience))throw new ContentError(400,'Неизвестная аудитория');
  const customers=audience==='selected'?data.customers:null;
  if(audience==='selected'&&(!Array.isArray(customers)||!customers.length||customers.length>500||customers.some(x=>typeof x!=='string'||!/^[a-f0-9-]{16,64}$/i.test(x))))throw new ContentError(400,'Выберите получателей');
  if(audience==='group'&&!['registered','subscribed'].includes(data.group))throw new ContentError(400,'Неизвестная группа');
  const title=typeof data.title==='string'?data.title.trim():'',message=typeof data.message==='string'?data.message.trim():'';
  if(typeof id!=='string'||!uuid.test(id)||!validPushPath(path)||!title||title.length>80||!message||message.length>240)
   throw new ContentError(400,'Укажите заголовок, текст и раздел для перехода');
  db.exec('BEGIN IMMEDIATE');
  try{
   const existing=getCampaign.get(id);
   if(existing&&(existing.title!==title||existing.message!==message||existing.path!==path))
    throw new ContentError(409,'Рассылка с этим идентификатором уже создана');
   if(!existing){
    db.prepare('INSERT INTO push_campaigns VALUES (?,?,?,?,?,?)').run(id,title,message,path,String(actor),now());
    const chosen=audience==='selected'?new Set(customers):null;
    const subs=db.prepare('SELECT id,customer FROM push_subscriptions').all().filter(s=>audience==='all'||audience==='group'&&data.group==='subscribed'||audience==='group'&&data.group==='registered'&&s.customer||chosen?.has(s.customer));
    const insert=db.prepare('INSERT INTO push_deliveries(id,campaign,subscriber) VALUES(?,?,?)');
    for(const sub of subs)insert.run(randomUUID().replaceAll('-','')+randomUUID().replaceAll('-','').slice(0,16),id,sub.id);
    const inbox=db.prepare('INSERT INTO push_inbox VALUES(?,?,?,?,?,?,?,0)');
    const audienceIds=audience==='selected'?customers:audience==='group'&&data.group==='registered'?data.registeredCustomers||[]:audience==='all'?data.registeredCustomers||[]:[...new Set(subs.map(s=>s.customer).filter(Boolean))];
    for(const customer of new Set(audienceIds))inbox.run(randomUUID(),customer,id,title,message,path,now());
   }
   db.exec('COMMIT');
  }catch(error){db.exec('ROLLBACK');throw error}
 }
 const counts=`COUNT(d.id) recipients,COUNT(CASE WHEN d.state='accepted' THEN 1 END) accepted,
  COUNT(CASE WHEN d.state='failed' THEN 1 END) failed,COUNT(CASE WHEN d.state='skipped' THEN 1 END) skipped,
  COUNT(CASE WHEN d.state='queued' OR (d.state='sending' AND d.attempted>=?) THEN 1 END) pending,
  COUNT(CASE WHEN d.state='sending' AND d.attempted<? THEN 1 END) unknown,
  COUNT(d.shown) shown,COUNT(d.opened) opened`;
 const stateTimes=()=>Array(2).fill(now()-60000);
 return {
  publicKey:vapidDetails.publicKey,
  bind(customer,data){const item=subscription(data);const id=hash(item.endpoint);return bind.run(customer,id,JSON.stringify(item)).changes>0},
  inbox(customer){return db.prepare('SELECT id,title,message,path,created,read FROM push_inbox WHERE customer=? ORDER BY created DESC LIMIT 100').all(customer)},
  markRead(customer,id){db.prepare('UPDATE push_inbox SET read=1 WHERE customer=? AND id=?').run(customer,id)},
  subscribe(data){
   const item=subscription(data),id=hash(item.endpoint);
   db.prepare('INSERT INTO push_subscriptions(id,data,analytics,created) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET analytics=excluded.analytics WHERE data=excluded.data').run(id,JSON.stringify(item),Number(data.analytics===true),now());
  },
  unsubscribe(data){
   const item=subscription(data),id=hash(item.endpoint);
   remove.run(id,JSON.stringify(item));
  },
  record(data){
   if(typeof data.id!=='string'||!/^[0-9a-f]{48}$/.test(data.id)||!['shown','opened'].includes(data.kind))
    throw new ContentError(400,'Некорректное событие');
   const field=data.kind;
   db.prepare(`UPDATE push_deliveries SET ${field}=COALESCE(${field},?)
    WHERE id=? AND state IN ('sending','accepted')`).run(now(),data.id);
  },
  status(){
   return {
    subscribers:db.prepare('SELECT COUNT(*) total FROM push_subscriptions').get().total,
    campaigns:db.prepare(`SELECT c.id,c.title,c.created,${counts}
     FROM push_campaigns c LEFT JOIN push_deliveries d ON d.campaign=c.id GROUP BY c.id
     ORDER BY c.created DESC LIMIT 50`).all(...stateTimes())
   };
  },
  report(from,to){
   const start=Date.parse(from+'T00:00:00+03:00'),end=Date.parse(to+'T00:00:00+03:00')+86400000;
   return db.prepare(`SELECT COUNT(DISTINCT c.id) campaigns,${counts}
    FROM push_campaigns c LEFT JOIN push_deliveries d ON d.campaign=c.id WHERE c.created>=? AND c.created<?`).get(...stateTimes(),start,end);
  },
  enqueue,drain
 };
}
