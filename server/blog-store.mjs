import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,chmodSync} from 'node:fs';
import {dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
import {ContentError} from './content-store.mjs';

const fail=(message,status=400)=>{throw new ContentError(status,message)};
const slugPattern=/^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const clean=(value,max)=>typeof value==='string'?value.trim().slice(0,max):'';
function normalize(value){
 if(!value||typeof value!=='object'||Array.isArray(value))fail('Некорректная статья');
 const title=clean(value.title,140),slug=clean(value.slug,100).toLowerCase();
 const sections=value.sections,links=value.sources,productIds=value.productIds;
 if(title.length<12||!slugPattern.test(slug))fail('Проверьте заголовок и адрес статьи');
 if(!Array.isArray(sections)||sections.length<2||sections.length>16||sections.some(s=>typeof s!=='string'||s.trim().length<50||s.length>2500))fail('Добавьте от 2 до 16 содержательных абзацев');
 if(!Array.isArray(links)||links.length>12||(links.length===1))fail('Для статьи с источниками нужны минимум два независимых сайта');
 const sources=links.map(s=>{if(!s||typeof s!=='object')fail('Проверьте источники');let url;try{url=new URL(s.url)}catch{fail('Неверная ссылка на источник')}if(url.protocol!=='https:'||url.username||url.password||url.hostname.length>200)fail('Источники должны использовать HTTPS');const label=clean(s.title,180);if(label.length<5)fail('Укажите название источника');return{title:label,url:url.href}});
 if(sources.length&&new Set(sources.map(s=>new URL(s.url).hostname.replace(/^www\./,'').toLowerCase())).size<2)fail('Источники должны быть с разных сайтов');
 if(!Array.isArray(productIds)||productIds.length<1||productIds.length>12||productIds.some(x=>!Number.isSafeInteger(x)||x<=0))fail('Свяжите статью с товарами каталога');
 const score=Number(value.score);
 if(!Number.isInteger(score)||score<0||score>100)fail('Некорректный рейтинг');
 const summary=sections[0].trim().slice(0,450);
 return{title,slug,summary,sections:sections.map(s=>s.trim()),sources,productIds:[...new Set(productIds)],score};
}
export function blogStore(path,{now=Date.now}={}){
 mkdirSync(dirname(path),{recursive:true});const db=new DatabaseSync(path);chmodSync(path,0o600);
 db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
 CREATE TABLE IF NOT EXISTS blog_articles(
 id TEXT PRIMARY KEY,slug TEXT UNIQUE NOT NULL,title TEXT NOT NULL,summary TEXT NOT NULL,
 sections TEXT NOT NULL,sources TEXT NOT NULL,product_ids TEXT NOT NULL,score INTEGER NOT NULL,
 published INTEGER NOT NULL DEFAULT 0,created INTEGER NOT NULL,updated INTEGER NOT NULL,published_at INTEGER
 );
 CREATE INDEX IF NOT EXISTS blog_articles_public ON blog_articles(published,published_at);`);
 const decode=r=>r&&({id:r.id,slug:r.slug,title:r.title,summary:r.summary,sections:JSON.parse(r.sections),sources:JSON.parse(r.sources),productIds:JSON.parse(r.product_ids),score:r.score,published:!!r.published,created:r.created,updated:r.updated,publishedAt:r.published_at});
 const find=id=>decode(db.prepare('SELECT * FROM blog_articles WHERE id=?').get(id));
 const list=()=>db.prepare('SELECT * FROM blog_articles ORDER BY updated DESC LIMIT 200').all().map(decode);
 const publicList=()=>db.prepare('SELECT * FROM blog_articles WHERE published=1 ORDER BY published_at DESC LIMIT 100').all().map(decode);
 const publicOne=slug=>{if(typeof slug!=='string'||!slugPattern.test(slug))return null;return decode(db.prepare('SELECT * FROM blog_articles WHERE published=1 AND slug=?').get(slug))};
 function save(value,id){
  const article=normalize(value),old=id?find(id):null;
  if(id&&!old)fail('Статья не найдена',404);
  if(old?.published)fail('Снимите статью с публикации перед редактированием',409);
  const used=db.prepare('SELECT id FROM blog_articles WHERE slug=?').get(article.slug);
  if(used&&used.id!==id)fail('Такой адрес статьи уже используется',409);
  const timestamp=now(),key=id||randomUUID();
  db.prepare(`INSERT INTO blog_articles(id,slug,title,summary,sections,sources,product_ids,score,published,created,updated,published_at)
   VALUES(?,?,?,?,?,?,?,?,0,?,?,NULL)
   ON CONFLICT(id) DO UPDATE SET slug=excluded.slug,title=excluded.title,summary=excluded.summary,
   sections=excluded.sections,sources=excluded.sources,product_ids=excluded.product_ids,score=excluded.score,updated=excluded.updated`)
   .run(key,article.slug,article.title,article.summary,JSON.stringify(article.sections),JSON.stringify(article.sources),JSON.stringify(article.productIds),article.score,old?.created||timestamp,timestamp);
  return find(key);
 }
 function publish(id,published,products){
  const article=find(id);if(!article)fail('Статья не найдена',404);
  if(published){
   if(article.sources.length&&article.score<85)fail('Статья не прошла фильтр конверсии: требуется минимум 85 баллов',409);
   const available=new Set(products.filter(p=>p.published!==false).map(p=>p.id));
   if(!article.productIds.some(id=>available.has(id)))fail('В статье нет доступных товаров магазина',409);
  }
  db.prepare('UPDATE blog_articles SET published=?,published_at=?,updated=? WHERE id=?').run(published?1:0,published?article.publishedAt||now():null,now(),id);
  return find(id);
 }
 function remove(id){
  const article=find(id);if(!article)fail('Статья не найдена',404);
  if(article.published)fail('Сначала снимите статью с публикации',409);
  db.prepare('DELETE FROM blog_articles WHERE id=?').run(id);
  return article;
 }
 return{list,publicList,publicOne,save,publish,remove,close:()=>db.close()};
}
