import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,chmodSync} from 'node:fs';
import {dirname} from 'node:path';
import {ContentError} from './content-store.mjs';
const DAY=86400000,offset=10800000;
export const eventKinds=['session_start','screen_view','product_view','search','favorite_add','favorite_remove','cart_add','checkout_start','banner_click','engagement','scroll_depth','size_select','photo_view','photo_zoom','filter_open','filter_select','cart_quantity','cart_remove','login_success','register_success','password_change','logout','support_click','install_prompt','install_close','install_accept','blog_article_open','blog_product_click','blog_collection_click'];
const screens=['shop','catalog','cart','favorites','profile','wardrobe','blog','blog_article','search','product','photo','checkout','order_confirmation','filters','delivery','support','login','register','password_change','install'];
export const channels=['direct','search','internal','referral','social','advertising','email','unknown','untracked'];
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const invalid=()=>{throw new ContentError(400,'Некорректное событие')};
export function validateEvents(body){
 if(!body||Object.keys(body).some(k=>k!=='events')||!Array.isArray(body.events)||!body.events.length||body.events.length>25)invalid();
 return body.events.map(e=>{
  if(!e||typeof e!=='object'||Object.keys(e).some(k=>!['id','visitor','session','kind','screen','productId','results','device','formFactor','mode','viewId','activeMs','depth','source','articleSlug'].includes(k)))invalid();
  for(const key of ['id','visitor','session'])if(typeof e[key]!=='string'||!uuid.test(e[key]))invalid();
  if(!eventKinds.includes(e.kind)||!['ios','android','windows','macos','linux','other'].includes(e.device)||!['mobile','tablet','desktop'].includes(e.formFactor)||!['pwa','browser'].includes(e.mode))invalid();
  if(e.screen!==undefined&&!screens.includes(e.screen))invalid();
  if(e.kind==='screen_view'&&!screens.includes(e.screen))invalid();
  if(e.productId!==undefined&&(!Number.isSafeInteger(e.productId)||e.productId<=0))invalid();
  if(['product_view','favorite_add','favorite_remove','cart_add'].includes(e.kind)&&!e.productId)invalid();
  if(e.results!==undefined&&(!Number.isInteger(e.results)||e.results<0||e.results>100000))invalid();
  if(e.kind==='search'&&e.results===undefined)invalid();
   if(e.articleSlug!==undefined&&(typeof e.articleSlug!=='string'||e.articleSlug.length>100||!(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).test(e.articleSlug)))invalid();
   if(['blog_article_open','blog_product_click','blog_collection_click'].includes(e.kind)&&!e.articleSlug)invalid();
   if(e.kind==='blog_product_click'&&!e.productId)invalid();
  if(e.viewId!==undefined&&!uuid.test(e.viewId))invalid();
  if(e.activeMs!==undefined&&(!Number.isInteger(e.activeMs)||e.activeMs<1||e.activeMs>60000||e.kind!=='engagement'))invalid();
  if(e.depth!==undefined&&(![25,50,75,100].includes(e.depth)||e.kind!=='scroll_depth'))invalid();
  if(['engagement','scroll_depth'].includes(e.kind)&&(!e.viewId||!e.screen))invalid();
  if(e.kind==='engagement'&&!e.activeMs||e.kind==='scroll_depth'&&!e.depth)invalid();
  if(e.source!==undefined){const s=e.source;if(!s||typeof s!=='object'||Object.keys(s).some(k=>!['type','detail'].includes(k))||!channels.includes(s.type)||typeof s.detail!=='string'||s.detail.length>100||!/^([a-z][a-z0-9-]*|(?:[a-z0-9-]+\.)+[a-z]{2,24})$/.test(s.detail))invalid();if(s.type!=='referral'&&!['direct','google','yandex','bing','duckduckgo','vk','telegram','instagram','facebook','tiktok','youtube','pinterest','sizey','other','unknown','untracked'].includes(s.detail))invalid()}
  return e;
 });
}
function period(days,range,end){const today=Math.floor((end+offset)/DAY)*DAY-offset;let start=today-(days-1)*DAY,finish=end;
 if(range?.from||range?.to){const parse=s=>{if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s))throw new ContentError(400,'Проверьте даты периода');const n=Date.parse(s+'T00:00:00Z');if(!Number.isFinite(n)||new Date(n).toISOString().slice(0,10)!==s)throw new ContentError(400,'Проверьте даты периода');return n-offset};start=parse(range.from);const last=parse(range.to);days=Math.round((last-start)/DAY)+1;if(days<1||days>90||last>today||start<today-89*DAY)throw new ContentError(400,'Выберите не более 90 дней в пределах доступной истории');finish=Math.min(end,last+DAY-1)
 }else if(![7,30,90].includes(days))throw new ContentError(400,'Выберите период');
 return{days,start,end:finish};
}
export function analyticsStore(path,{now=Date.now,geoLookup=null,geoProvider=null}={}){
 mkdirSync(dirname(path),{recursive:true});const db=new DatabaseSync(path);chmodSync(path,0o600);
 db.exec(`PRAGMA journal_mode=WAL;PRAGMA busy_timeout=5000;PRAGMA foreign_keys=ON;
 CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY,visitor TEXT NOT NULL,session TEXT NOT NULL,kind TEXT NOT NULL,screen TEXT,product_id INTEGER,results INTEGER,device TEXT NOT NULL,form_factor TEXT NOT NULL,mode TEXT NOT NULL,created INTEGER NOT NULL);
 CREATE INDEX IF NOT EXISTS events_created ON events(created);CREATE INDEX IF NOT EXISTS events_kind_created ON events(kind,created);CREATE INDEX IF NOT EXISTS events_session ON events(session,created);
 CREATE TABLE IF NOT EXISTS analytics_meta(key TEXT PRIMARY KEY,value INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS event_details(event_id TEXT PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,view_id TEXT,active_ms INTEGER,depth INTEGER);
 CREATE INDEX IF NOT EXISTS details_view ON event_details(view_id);
  CREATE TABLE IF NOT EXISTS blog_event_articles(event_id TEXT PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,slug TEXT NOT NULL);
  CREATE INDEX IF NOT EXISTS blog_event_articles_slug ON blog_event_articles(slug);
 CREATE TABLE IF NOT EXISTS analytics_sessions(session TEXT PRIMARY KEY,visitor TEXT NOT NULL,created INTEGER NOT NULL,device TEXT NOT NULL,form_factor TEXT NOT NULL,mode TEXT NOT NULL,source TEXT NOT NULL,source_detail TEXT NOT NULL,country TEXT,city TEXT);
 CREATE INDEX IF NOT EXISTS analytics_sessions_created ON analytics_sessions(created);`);
 db.prepare("INSERT OR IGNORE INTO analytics_meta VALUES('started',?)").run(now());
 // Existing events remain readable, but missing acquisition data is never invented.
 db.exec(`INSERT OR IGNORE INTO analytics_sessions SELECT session,visitor,created,device,form_factor,mode,'untracked','untracked',NULL,NULL FROM (SELECT *,ROW_NUMBER() OVER(PARTITION BY session ORDER BY created,rowid) n FROM events) WHERE n=1`);
 const prune=()=>{db.prepare('DELETE FROM events WHERE created<?').run(now()-90*DAY);db.exec('DELETE FROM event_details WHERE event_id NOT IN (SELECT id FROM events);DELETE FROM blog_event_articles WHERE event_id NOT IN (SELECT id FROM events);DELETE FROM analytics_sessions WHERE session NOT IN (SELECT DISTINCT session FROM events)')};prune();let cleaned=now();
 const timer=setInterval(()=>{try{prune()}catch{}},3600000);timer.unref();
 const insert=db.prepare('INSERT OR IGNORE INTO events(id,visitor,session,kind,screen,product_id,results,device,form_factor,mode,created) VALUES(?,?,?,?,?,?,?,?,?,?,?)');
 const details=db.prepare('INSERT INTO event_details VALUES(?,?,?,?)');
  const blogDetails=db.prepare('INSERT INTO blog_event_articles VALUES(?,?)');
 const newSession=db.prepare('INSERT OR IGNORE INTO analytics_sessions VALUES(?,?,?,?,?,?,?,?,?,?)');
 const botPattern=/(?:bot|crawler|spider|headless|lighthouse|pagespeed|pingdom|uptimerobot|statuscake|python-requests|curl|wget|httpclient|playwright|puppeteer|selenium|googleother|facebookexternalhit|whatsapp|telegrambot|yandeximages)/i;
 const diagnostics=db.prepare("INSERT INTO analytics_meta(key,value) VALUES(?,1) ON CONFLICT(key) DO UPDATE SET value=value+1");
 const sessionVolume=db.prepare("SELECT COUNT(*) total,SUM(kind='screen_view') views FROM events WHERE session=? AND created>=?");
 function collect(body,{ip,userAgent='',referer='',host=''}={}){const events=validateEvents(body),time=now();
  // Keep suspect requests out of reports without altering any historical events.
  if(botPattern.test(userAgent)||/admmm\.sizey\.ru/i.test(referer)||/^admmm\.sizey\.ru(?::[0-9]+)?$/i.test(host)){
   diagnostics.run('filtered_automated_batches');return 0;
  }
  const totals=new Map();
  for(const e of events){let volume=totals.get(e.session);if(!volume){const old=sessionVolume.get(e.session,time-DAY);volume={total:old.total||0,views:old.views||0};totals.set(e.session,volume)}volume.total++;if(e.kind==='screen_view')volume.views++;if(volume.total>600||volume.views>120){diagnostics.run('filtered_excessive_batches');return 0}}
 let geo=null;try{geo=geoLookup?.(ip)||null}catch{}const country=/^[A-Z]{2}$/.test(geo?.country)?geo.country:null,city=country&&typeof geo?.city==='string'?geo.city.slice(0,100):null;
  db.exec('BEGIN');let accepted=0;try{for(const e of events){const changed=insert.run(e.id,e.visitor,e.session,e.kind,e.screen||null,e.productId||null,e.results??null,e.device,e.formFactor,e.mode,time).changes;if(!changed)continue;accepted++;newSession.run(e.session,e.visitor,time,e.device,e.formFactor,e.mode,e.source?.type||'untracked',e.source?.detail||'untracked',country,city);if(e.viewId||e.activeMs||e.depth)details.run(e.id,e.viewId||null,e.activeMs||null,e.depth||null);if(e.articleSlug)blogDetails.run(e.id,e.articleSlug)}if(time-cleaned>3600000){prune();cleaned=time}db.exec('COMMIT')}catch(e){db.exec('ROLLBACK');throw e}return accepted
 }
 const metrics=(start,end)=>db.prepare(`SELECT COUNT(DISTINCT visitor) visitors,COUNT(DISTINCT session) sessions,COUNT(*) events,COALESCE(SUM(kind='screen_view'),0) views,COALESCE(SUM(kind='product_view'),0) productViews,COUNT(DISTINCT CASE WHEN kind='product_view' THEN visitor END) productVisitors,COALESCE(SUM(kind='cart_add'),0) cartAdds,COUNT(DISTINCT CASE WHEN kind='cart_add' THEN visitor END) cartVisitors,COUNT(DISTINCT CASE WHEN kind='cart_add' THEN session END) cartSessions,COALESCE(SUM(kind='favorite_add'),0) favoriteAdds,COALESCE(SUM(kind='search'),0) searches,COALESCE(SUM(kind='search' AND results=0),0) emptySearches,COUNT(DISTINCT CASE WHEN kind='checkout_start' THEN visitor END) checkoutVisitors,COUNT(DISTINCT CASE WHEN kind='register_success' THEN session END) registerSessions,COUNT(DISTINCT CASE WHEN mode='pwa' THEN session END) pwaSessions FROM events WHERE created>=? AND created<=?`).get(start,end);
 function report(days=30,range){const current=period(days,range,now()),{start,end}=current;days=current.days;const startedAt=db.prepare("SELECT value FROM analytics_meta WHERE key='started'").get().value;
 const row=metrics(start,end),previousStart=start-days*DAY,previousEnd=start-1;
 const eligible=`SELECT DISTINCT session FROM events WHERE created>=? AND created<=?`;
 const formFactors=(a,b)=>db.prepare(`SELECT CASE WHEN form_factor='tablet' THEN 'mobile' ELSE form_factor END device,COUNT(*) sessions FROM analytics_sessions WHERE session IN (${eligible}) GROUP BY 1 ORDER BY sessions DESC`).all(a,b);
 const raw=db.prepare(`SELECT date(created/1000,'unixepoch','+3 hours') date,COUNT(DISTINCT visitor) visitors,COUNT(DISTINCT session) sessions,SUM(kind='screen_view') views,COUNT(DISTINCT CASE WHEN kind='cart_add' THEN session END) cartSessions,COUNT(DISTINCT CASE WHEN kind='register_success' THEN session END) registerSessions,COUNT(DISTINCT CASE WHEN form_factor='desktop' THEN session END) desktopSessions,COUNT(DISTINCT CASE WHEN form_factor IN ('mobile','tablet') THEN session END) mobileSessions,0 tabletSessions FROM events WHERE created>=? AND created<=? GROUP BY date ORDER BY date`).all(start,end);
 const byDate=new Map(raw.map(r=>[r.date,r]));const daily=Array.from({length:days},(_,i)=>{const date=new Date(start+offset+i*DAY).toISOString().slice(0,10);return byDate.get(date)||{date,visitors:0,sessions:0,views:0,cartSessions:0,registerSessions:0,desktopSessions:0,mobileSessions:0,tabletSessions:0}});
 const hourlyStart=Math.floor(Math.max(start,startedAt)/3600000)*3600000,hourlyEnd=Math.floor(end/3600000)*3600000,hours=Math.floor((hourlyEnd-hourlyStart)/3600000)+1;
 const hourly=[];
 if(hours>0&&hours<=48){const rows=db.prepare(`SELECT CAST(created/3600000 AS INTEGER)*3600000 timestamp,COUNT(DISTINCT visitor) visitors,COUNT(DISTINCT session) sessions,SUM(kind='screen_view') views FROM events WHERE created>=? AND created<=? GROUP BY timestamp ORDER BY timestamp`).all(start,end),byHour=new Map(rows.map(r=>[r.timestamp,r]));for(let t=hourlyStart;t<=hourlyEnd;t+=3600000)hourly.push(byHour.get(t)||{timestamp:t,visitors:0,sessions:0,views:0})}
 const products=db.prepare(`SELECT product_id id,SUM(kind='product_view') views,SUM(kind='favorite_add') favorites,SUM(kind='cart_add') cartAdds FROM events WHERE created>=? AND created<=? AND product_id IS NOT NULL GROUP BY product_id ORDER BY views DESC,cartAdds DESC LIMIT 15`).all(start,end);
 const devices=db.prepare(`SELECT device,COUNT(*) sessions FROM analytics_sessions WHERE session IN (${eligible}) GROUP BY 1 ORDER BY sessions DESC`).all(start,end);
 const pages=db.prepare(`SELECT screen,SUM(kind='screen_view') views,COUNT(DISTINCT session) sessions,COUNT(DISTINCT visitor) visitors,COUNT(DISTINCT CASE WHEN form_factor='desktop' THEN session END) desktopSessions,COUNT(DISTINCT CASE WHEN form_factor IN ('mobile','tablet') THEN session END) mobileSessions,0 tabletSessions,SUM(CASE WHEN kind NOT IN ('session_start','screen_view','engagement','scroll_depth') THEN 1 ELSE 0 END) actions FROM events WHERE created>=? AND created<=? AND screen IS NOT NULL GROUP BY screen ORDER BY views DESC`).all(start,end);
 const engagement=db.prepare(`SELECT e.screen,COUNT(DISTINCT CASE WHEN e.kind='screen_view' THEN d.view_id END) measuredViews,COUNT(DISTINCT CASE WHEN e.kind='screen_view' THEN e.session END) measuredSessions,COALESCE(SUM(d.active_ms),0) activeMs,COUNT(DISTINCT CASE WHEN d.active_ms>0 THEN e.session END) engagedSessions,COUNT(DISTINCT CASE WHEN d.depth>=25 THEN e.session END) scroll25,COUNT(DISTINCT CASE WHEN d.depth>=50 THEN e.session END) scroll50,COUNT(DISTINCT CASE WHEN d.depth>=75 THEN e.session END) scroll75,COUNT(DISTINCT CASE WHEN d.depth>=100 THEN e.session END) scroll100 FROM events e JOIN event_details d ON d.event_id=e.id WHERE e.created>=? AND e.created<=? AND e.screen IS NOT NULL GROUP BY e.screen`).all(start,end);
 const byScreen=new Map(engagement.map(e=>[e.screen,e]));
 const actions=db.prepare(`SELECT screen,kind,COUNT(*) count,COUNT(DISTINCT session) sessions FROM events WHERE created>=? AND created<=? AND kind NOT IN ('session_start','screen_view','engagement','scroll_depth') GROUP BY screen,kind ORDER BY count DESC`).all(start,end);
 const blogArticles=db.prepare(`SELECT a.slug, SUM(e.kind='blog_article_open') opens,COUNT(DISTINCT CASE WHEN e.kind='blog_article_open' THEN e.session END) readers,SUM(e.kind='blog_product_click') productClicks,COUNT(DISTINCT CASE WHEN e.kind='cart_add' THEN e.session END) cartSessions,COUNT(DISTINCT CASE WHEN e.kind='checkout_start' THEN e.session END) checkoutSessions FROM blog_event_articles a JOIN events e ON e.id=a.event_id WHERE e.created>=? AND e.created<=? GROUP BY a.slug ORDER BY cartSessions DESC,productClicks DESC,opens DESC LIMIT 100`).all(start,end);
 const sources=db.prepare(`SELECT source,COUNT(*) sessions FROM analytics_sessions WHERE session IN (${eligible}) GROUP BY source ORDER BY sessions DESC`).all(start,end);
 const sourceDetails=db.prepare(`SELECT source,source_detail detail,COUNT(*) sessions FROM analytics_sessions WHERE session IN (${eligible}) GROUP BY source,source_detail ORDER BY sessions DESC LIMIT 50`).all(start,end);
 const countries=db.prepare(`SELECT country,COUNT(*) sessions FROM analytics_sessions WHERE session IN (${eligible}) AND country IS NOT NULL GROUP BY country ORDER BY sessions DESC LIMIT 10`).all(start,end);
 const cities=db.prepare(`SELECT country,city,COUNT(*) sessions FROM analytics_sessions WHERE session IN (${eligible}) AND city IS NOT NULL AND city<>'' GROUP BY country,city ORDER BY sessions DESC LIMIT 10`).all(start,end);
 const geoCount=db.prepare(`SELECT COUNT(country) countries,COUNT(CASE WHEN city<>'' THEN city END) cities FROM analytics_sessions WHERE session IN (${eligible})`).get(start,end);
 const filterStats=Object.fromEntries(db.prepare("SELECT key,value FROM analytics_meta WHERE key LIKE 'filtered_%'").all().map(row=>[row.key,row.value]));
 return{filterStats,days,startedAt,updatedAt:now(),retentionDays:90,timezone:'Europe/Moscow',from:new Date(start+offset).toISOString().slice(0,10),to:new Date(end+offset).toISOString().slice(0,10),metrics:row,daily,hourly,products,blogArticles,devices,formFactors:formFactors(start,end),pages:pages.map(p=>({...p,...(byScreen.get(p.screen)||{measuredViews:0,measuredSessions:0,activeMs:0,engagedSessions:0,scroll25:0,scroll50:0,scroll75:0,scroll100:0})})),actions,sources,sourceDetails,countries,cities,geography:{enabled:!!geoLookup,provider:geoProvider,...geoCount},comparison:{available:previousStart>=Math.max(startedAt,now()-90*DAY),metrics:metrics(previousStart,previousEnd),formFactors:formFactors(previousStart,previousEnd),from:new Date(previousStart+offset).toISOString().slice(0,10),to:new Date(previousEnd+offset).toISOString().slice(0,10)}};
 }
 function reset(){db.exec('BEGIN');try{db.exec('DELETE FROM event_details;DELETE FROM blog_event_articles;DELETE FROM events;DELETE FROM analytics_sessions;DELETE FROM analytics_meta;');db.prepare("INSERT INTO analytics_meta(key,value) VALUES('started',?)").run(now());db.exec('COMMIT')}catch(error){db.exec('ROLLBACK');throw error}}
 return{collect,report,reset,close:()=>{clearInterval(timer);db.close()}};
}
