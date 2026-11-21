import {createPushStore} from './push.mjs';
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
  return customers.map(row=>({id:row.id,phone:row.phone,name:names.get(row.phone.replace(/^\\+/,''))||'Клиент SIZEY Hub'}));
 }finally{auth.close()}
};
const adminHandler=createAdmin({store,blog,blogAI,analytics,push,listPushCustomers,eventOrigin:publicOrigin,descriptionAI,keywordSuggestions,staffAuth:staffBackend(),listClients:async()=>{const rows=pool?(await pool.query('SELECT id,name,phone_normalized FROM clients WHERE deleted_at IS NULL ORDER BY name')).rows:[];const phones=new Set(rows.map(c=>c.phone_normalized));const auth=new DatabaseSync(database,{readOnly:true});try{for(const c of auth.prepare('SELECT id,phone FROM customers').all()){const phone=c.phone.replace(/^\+/, '');if(!phones.has(phone))rows.push({id:c.id,name:'Клиент SIZEY Hub',phone_normalized:phone,hasLoyalty:false})}}finally{auth.close()}return rows},mediaDirectory:directory+'/media'});
const app=createAuth({database,adminHandler,push,getLoyaltyClient:pool?async id=>(await pool.query('SELECT id,name,phone_normalized FROM clients WHERE id=$1 AND deleted_at IS NULL',[id])).rows[0]||null:null,loyalty:pool?createLoyaltyReader(pool):null,listLoyaltyCustomers:pool?async()=>(await pool.query('SELECT id,name,phone_normalized FROM clients WHERE deleted_at IS NULL ORDER BY name')).rows:null,staffAuth:staffBackend(),secret:process.env.AUTH_SECRET,origin:publicOrigin});
chmodSync(database,0o600);
app.server.listen(8080,'0.0.0.0',()=>console.log('SIZEY password auth listening on 8080'));
