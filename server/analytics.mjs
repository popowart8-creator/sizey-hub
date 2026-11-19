import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,chmodSync} from 'node:fs';
import {dirname} from 'node:path';
import {ContentError} from './content-store.mjs';
const DAY=86400000,offset=10800000;
export const eventKinds=['session_start','screen_view','product_view','search','favorite_add','favorite_remove','cart_add','checkout_start','banner_click'];
const screens=['shop','catalog','cart','favorites','profile','wardrobe','search'];
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const invalid=()=>{throw new ContentError(400,'Некорректное событие')};
export function validateEvents(body){
 if(!body||Object.keys(body).some(k=>k!=='events')||!Array.isArray(body.events)||!body.events.length||body.events.length>25)invalid();
 return body.events.map(e=>{
  if(!e||typeof e!=='object'||Object.keys(e).some(k=>!['id','visitor','session','kind','screen','productId','results','device','formFactor','mode'].includes(k)))invalid();
  for(const key of ['id','visitor','session'])if(typeof e[key]!=='string'||!uuid.test(e[key]))invalid();
  if(!eventKinds.includes(e.kind)||!['ios','android','windows','macos','linux','other'].includes(e.device)||!['mobile','tablet','desktop'].includes(e.formFactor)||!['pwa','browser'].includes(e.mode))invalid();
  if(e.screen!==undefined&&!screens.includes(e.screen))invalid();
  if(e.kind==='screen_view'&&!screens.includes(e.screen))invalid();
  if(e.productId!==undefined&&(!Number.isSafeInteger(e.productId)||e.productId<=0))invalid();
  if(['product_view','favorite_add','favorite_remove','cart_add'].includes(e.kind)&&!e.productId)invalid();
  if(e.results!==undefined&&(!Number.isInteger(e.results)||e.results<0||e.results>100000))invalid();
  if(e.kind==='search'&&e.results===undefined)invalid();
  return e;
 });
}
export function analyticsStore(path,{now=Date.now}={}){
 mkdirSync(dirname(path),{recursive:true});const db=new DatabaseSync(path);chmodSync(path,0o600);
 db.exec(`PRAGMA journal_mode=WAL;PRAGMA busy_timeout=5000;CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY,visitor TEXT NOT NULL,session TEXT NOT NULL,kind TEXT NOT NULL,screen TEXT,product_id INTEGER,results INTEGER,device TEXT NOT NULL,form_factor TEXT NOT NULL,mode TEXT NOT NULL,created INTEGER NOT NULL);CREATE INDEX IF NOT EXISTS events_created ON events(created);CREATE INDEX IF NOT EXISTS events_kind_created ON events(kind,created);CREATE TABLE IF NOT EXISTS analytics_meta(key TEXT PRIMARY KEY,value INTEGER NOT NULL);`);
 db.prepare("INSERT OR IGNORE INTO analytics_meta VALUES('started',?)").run(now());let cleaned=0;
 const prune=()=>db.prepare('DELETE FROM events WHERE created<?').run(now()-90*DAY);prune();const timer=setInterval(()=>{try{prune()}catch{/* Retry maintenance next hour without interrupting requests. */}},3600000);timer.unref();
 const insert=db.prepare('INSERT OR IGNORE INTO events VALUES(?,?,?,?,?,?,?,?,?,?,?)');
 function collect(body){const events=validateEvents(body),time=now();db.exec('BEGIN');let accepted=0;try{for(const e of events)accepted+=insert.run(e.id,e.visitor,e.session,e.kind,e.screen||null,e.productId||null,e.results??null,e.device,e.formFactor,e.mode,time).changes;if(!cleaned||time-cleaned>3600000){db.prepare('DELETE FROM events WHERE created<?').run(time-90*DAY);cleaned=time}db.exec('COMMIT')}catch(e){db.exec('ROLLBACK');throw e}return accepted}
 function report(days=30){if(![7,30,90].includes(days))throw new ContentError(400,'Выберите период');const end=now(),start=Math.floor((end+offset)/DAY)*DAY-offset-(days-1)*DAY;
 const row=db.prepare(`SELECT COUNT(DISTINCT visitor) visitors,COUNT(DISTINCT session) sessions,COUNT(*) events,COALESCE(SUM(kind='screen_view'),0) views,COALESCE(SUM(kind='product_view'),0) productViews,COUNT(DISTINCT CASE WHEN kind='product_view' THEN visitor END) productVisitors,COALESCE(SUM(kind='cart_add'),0) cartAdds,COUNT(DISTINCT CASE WHEN kind='cart_add' THEN visitor END) cartVisitors,COALESCE(SUM(kind='favorite_add'),0) favoriteAdds,COALESCE(SUM(kind='search'),0) searches,COALESCE(SUM(kind='search' AND results=0),0) emptySearches,COUNT(DISTINCT CASE WHEN kind='checkout_start' THEN visitor END) checkoutVisitors,COUNT(DISTINCT CASE WHEN mode='pwa' THEN session END) pwaSessions FROM events WHERE created>=? AND created<=?`).get(start,end);
 const raw=db.prepare("SELECT date(created/1000,'unixepoch','+3 hours') date,COUNT(DISTINCT visitor) visitors,COUNT(DISTINCT session) sessions FROM events WHERE created>=? AND created<=? GROUP BY date ORDER BY date").all(start,end);const byDate=new Map(raw.map(r=>[r.date,r]));const daily=Array.from({length:days},(_,i)=>{const date=new Date(start+offset+i*DAY).toISOString().slice(0,10);return byDate.get(date)||{date,visitors:0,sessions:0}});
 const products=db.prepare(`SELECT product_id id,SUM(kind='product_view') views,SUM(kind='favorite_add') favorites,SUM(kind='cart_add') cartAdds FROM events WHERE created>=? AND created<=? AND product_id IS NOT NULL GROUP BY product_id ORDER BY views DESC,cartAdds DESC LIMIT 15`).all(start,end);
 const devices=db.prepare('SELECT device,COUNT(DISTINCT session) sessions FROM events WHERE created>=? AND created<=? GROUP BY device ORDER BY sessions DESC').all(start,end);
 const formFactors=db.prepare('SELECT form_factor device,COUNT(DISTINCT session) sessions FROM events WHERE created>=? AND created<=? GROUP BY form_factor ORDER BY sessions DESC').all(start,end);
 const pages=db.prepare("SELECT screen,COUNT(*) views FROM events WHERE created>=? AND created<=? AND kind='screen_view' GROUP BY screen ORDER BY views DESC").all(start,end);
 return{days,startedAt:db.prepare("SELECT value FROM analytics_meta WHERE key='started'").get().value,updatedAt:end,retentionDays:90,timezone:'Europe/Moscow',metrics:row,daily,products,devices,formFactors,pages};
 }
 return{collect,report,close:()=>{clearInterval(timer);db.close()}};
}
