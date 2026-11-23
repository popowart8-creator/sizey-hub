import {createPushStore} from './push.mjs';
import {randomUUID} from 'node:crypto';
import {scheduleDailyBlogDrafts} from './blog-auto.mjs';
import {blogStore} from './blog-store.mjs';
import {createBlogAI} from './blog-ai.mjs';
import {createKeywordSuggestions} from './keyword-suggestions.mjs';
import {createDescriptionAI} from './ai-description.mjs';
import {createGeoLookup} from './geo.mjs';
import {DatabaseSync} from 'node:sqlite';
import {analyticsStore} from './analytics.mjs';
import {contentStore} from './content-store.mjs';
import {createAdmin} from './admin.mjs';
import {mkdirSync,chmodSync} from 'node:fs';
import {createAuth} from './auth.mjs';
import {createLoyaltyReader,loyaltyPool} from './loyalty.mjs';
import {staffBackend} from './staff.mjs';
const directory=process.env.DATA_DIR||'/data';mkdirSync(directory,{recursive:true,mode:0o700});
const database=directory+'/auth.sqlite';
const pool=process.env.LOYALTY_DATABASE_URL?loyaltyPool(process.env.LOYALTY_DATABASE_URL):null;
const store=contentStore(directory+'/hub-content.sqlite');chmodSync(directory+'/hub-content.sqlite',0o600);
const geo=createGeoLookup();
const analytics=analyticsStore(directory+'/analytics.sqlite',{geoLookup:geo.lookup,geoProvider:geo.provider});
const push=createPushStore(directory+'/push.sqlite');
chmodSync(directory+'/push.sqlite',0o600);
const drainPush=()=>void push.drain().catch(error=>console.error('Push queue:',error.message));
drainPush();
setInterval(drainPush,60000).unref();
// Read-only loyalty event watcher: never modifies balances or awards bonuses.
let automationSince=new Date();
let automationRunning=false;
async function scanBonusNotifications(){
 if(automationRunning||!pool)return;
 const settings=push.automationSettings();
 automationRunning=true;
 try{
  const from=new Date(Math.max(automationSince.getTime()-60000,Date.now()-48*3600000));
  const {rows}=await pool.query(`SELECT t.id,t.type,t.balance_before,t.balance_after,t.created_at,c.phone_normalized
    FROM transactions t JOIN clients c ON c.id=t.client_id
    WHERE t.created_at >= $1 AND t.created_at <= NOW() AND c.deleted_at IS NULL
    AND t.balance_after > t.balance_before
    ORDER BY t.created_at ASC LIMIT 1000`,[from]);
  const auth=new DatabaseSync(database,{readOnly:true});
  let accounts;
  try{accounts=new Map(auth.prepare('SELECT id,phone FROM customers').all().map(row=>[String(row.phone).replace(/^\+/,''),row.id]))}
  finally{auth.close()}
  for(const row of rows){
   const birthday=/BIRTHDAY|BIRTH|ДЕНЬ_РОЖД/i.test(String(row.type));
   const customer=accounts.get(String(row.phone_normalized));
   if(!customer)continue;
   const key='loyalty:'+row.id;
   if(push.eventSeen(key))continue;
   const amount=Number(row.balance_after)-Number(row.balance_before);
   const title=birthday?settings.birthdayTitle:settings.purchaseTitle;
   const template=birthday?settings.birthdayMessage:settings.purchaseMessage;
   const message=template.replaceAll('{amount}',String(amount));
   push.enqueue({id:randomUUID(),title,message,path:'/?tab=profile',audience:'selected',customers:[customer]},'loyalty-automation');
   push.markEvent(key);
  }
  automationSince=new Date();
  void push.drain().catch(error=>console.error('Bonus push queue:',error.message));
 }catch(error){console.error('Bonus notification scan:',error.message)}
 finally{automationRunning=false}
}
setInterval(()=>void scanBonusNotifications(),60000).unref();
const publicOrigin=process.env.PUBLIC_ORIGIN||'https://hub.sizey.ru';
const blog=blogStore(directory+'/blog.sqlite');
const blogAI=createBlogAI();
scheduleDailyBlogDrafts({blog,blogAI,store});
const descriptionAI=createDescriptionAI();
const keywordSuggestions=createKeywordSuggestions();
const listPushCustomers=async()=>{
 const auth=new DatabaseSync(database,{readOnly:true});
 try{
  const customers=auth.prepare('SELECT id,phone FROM customers ORDER BY created DESC').all();
  let names=new Map();
  if(pool){try{const rows=(await pool.query('SELECT name,phone_normalized FROM clients WHERE deleted_at IS NULL')).rows;names=new Map(rows.map(row=>[String(row.phone_normalized),row.name]))}catch{/* customer list remains available */}}
  return customers.map(row=>({id:row.id,phone:row.phone,name:names.get(row.phone.slice(1))||'Клиент SIZEY Hub'}));
 }finally{auth.close()}
};
const adminHandler=createAdmin({store,blog,blogAI,analytics,push,listPushCustomers,eventOrigin:publicOrigin,descriptionAI,keywordSuggestions,staffAuth:staffBackend(),listClients:async()=>{const rows=pool?(await pool.query('SELECT id,name,phone_normalized FROM clients WHERE deleted_at IS NULL ORDER BY name')).rows:[];const phones=new Set(rows.map(c=>c.phone_normalized));const auth=new DatabaseSync(database,{readOnly:true});try{for(const c of auth.prepare('SELECT id,phone FROM customers').all()){const phone=c.phone.replace(/^\+/, '');if(!phones.has(phone))rows.push({id:c.id,name:'Клиент SIZEY Hub',phone_normalized:phone,hasLoyalty:false})}}finally{auth.close()}return rows},sessionDatabase:directory+'/admin-sessions.sqlite',mediaDirectory:directory+'/media'});
const app=createAuth({database,adminHandler,push,getLoyaltyClient:pool?async id=>(await pool.query('SELECT id,name,phone_normalized FROM clients WHERE id=$1 AND deleted_at IS NULL',[id])).rows[0]||null:null,loyalty:pool?createLoyaltyReader(pool):null,listLoyaltyCustomers:pool?async()=>(await pool.query('SELECT id,name,phone_normalized FROM clients WHERE deleted_at IS NULL ORDER BY name')).rows:null,staffAuth:staffBackend(),secret:process.env.AUTH_SECRET,origin:publicOrigin});
chmodSync(database,0o600);
app.server.listen(8080,'0.0.0.0',()=>console.log('SIZEY password auth listening on 8080'));
