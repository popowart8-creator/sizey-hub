import {createHash,randomBytes} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {ContentError,storeImage} from './content-store.mjs';
import {assistantMessages} from './admin-assistant.mjs';
import {loyaltyAdminRequest} from './loyalty-admin.mjs';
export function createAdmin({store,blog,blogAI,analytics,descriptionAI,keywordSuggestions,staffAuth,listClients,mediaDirectory,origin='https://admmm.sizey.ru',eventOrigin='https://hub.sizey.ru',now=Date.now}){
 const ingestRates=new Map();
 const blogJobs=new Map();
 const jobExpiry=30*60*1000;
 const cleanBlogJobs=()=>{for(const [id,job] of blogJobs)if(job.created+jobExpiry<now()&&job.state!=='running')blogJobs.delete(id)};
 const sessions=new Map(),attempts=new Map(),hash=value=>createHash('sha256').update(value).digest('hex');
 const cookie=(value,age)=>`__Host-sizey_admin=${value}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${age}`;
 const token=req=>String(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('__Host-sizey_admin='))?.split('=')[1];
 async function body(req,limit=32768){let size=0,parts=[];for await(const part of req){size+=part.length;if(size>limit)throw new ContentError(413,'Запрос слишком большой');parts.push(part)}try{const data=JSON.parse(Buffer.concat(parts).toString());if(!data||typeof data!=='object'||Array.isArray(data))throw Error();return data}catch{throw new ContentError(400,'Некорректные данные')}}
 async function actor(req){const sid=token(req),session=sid&&sessions.get(hash(sid));if(!session||session.expires<=now())throw new ContentError(401,'Войдите в панель управления');let user;try{user=await staffAuth.me(session.accessToken)}catch{sessions.delete(hash(sid));throw new ContentError(401,'Сессия завершилась. Войдите снова.')}if(user.role!=='ADMIN'||user.status&&user.status!=='ACTIVE')throw new ContentError(403,'Доступ только администратору');return user}
 return async(req,res)=>{
  const path=new URL(req.url,'http://internal').pathname;
  if(!path.startsWith('/hub-api/blog')&&path!=='/hub-api/events'&&path!=='/hub-api/content'&&!path.startsWith('/hub-api/admin/')&&!path.startsWith('/hub-api/media/'))return false;
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
   if(path==='/hub-api/blog'&&req.method==='GET'){reply(200,{articles:blog?.publicList()||[]});return true}
    if(path.startsWith('/hub-api/blog/')&&req.method==='GET'){const slug=path.slice('/hub-api/blog/'.length);const article=blog?.publicOne(slug);if(!article)throw new ContentError(404,'Статья не найдена');reply(200,{article});return true}
    if(path==='/hub-api/content'&&req.method==='GET'){reply(200,store.publicContent());return true}
   if(path.startsWith('/hub-api/media/')&&req.method==='GET'){const name=path.slice('/hub-api/media/'.length);if(!/^[a-f0-9]{64}\.(jpg|png|webp)$/.test(name))throw new ContentError(404,'Фотография не найдена');let data;try{data=readFileSync(join(mediaDirectory,name))}catch{throw new ContentError(404,'Фотография не найдена')}res.writeHead(200,{'Content-Type':name.endsWith('.jpg')?'image/jpeg':name.endsWith('.png')?'image/png':'image/webp','Cache-Control':'public, max-age=31536000, immutable','X-Content-Type-Options':'nosniff'});res.end(data);return true}
   if(['POST','PATCH','PUT','DELETE'].includes(req.method)){if(req.headers.origin!==origin)throw new ContentError(403,'Недопустимый источник запроса');if(!String(req.headers['content-type']).startsWith('application/json'))throw new ContentError(415,'Ожидается JSON')}
   if(path==='/hub-api/admin/login'&&req.method==='POST'){
    const key=String(req.headers['x-real-ip']||req.socket.remoteAddress),list=(attempts.get(key)||[]).filter(t=>t>now()-900000);if(list.length>=10)throw new ContentError(429,'Слишком много попыток входа. Попробуйте позже.');list.push(now());attempts.set(key,list);for(const[k,v]of attempts)if(v.every(t=>t<=now()-900000))attempts.delete(k);
    const b=await body(req);if(typeof b.login!=='string'||typeof b.password!=='string'||b.login.length>128||b.password.length>256)throw new ContentError(400,'Укажите логин и пароль');let login;try{login=await staffAuth.login(b.login,b.password)}catch{throw new ContentError(401,'Неверный логин или пароль')};if(!login.accessToken||login.user?.role!=='ADMIN'||login.user.status&&login.user.status!=='ACTIVE')throw new ContentError(403,'Доступ только администратору');const sid=randomBytes(32).toString('hex');for(const[k,v]of sessions)if(v.expires<=now())sessions.delete(k);sessions.set(hash(sid),{accessToken:login.accessToken,expires:now()+900000});reply(200,{user:{id:login.user.id,name:login.user.name,role:'ADMIN'}},cookie(sid,900));return true;
   }
   if(path==='/hub-api/admin/session'&&req.method==='POST'){
    const match=/^Bearer ([A-Za-z0-9._~-]{1,8192})$/.exec(String(req.headers.authorization||''));if(!match)throw new ContentError(401,'Требуется вход сотрудника');let user;try{user=await staffAuth.me(match[1])}catch{throw new ContentError(401,'Сессия завершилась')};if(user.role!=='ADMIN'||user.status&&user.status!=='ACTIVE')throw new ContentError(403,'Доступ только администратору');const sid=randomBytes(32).toString('hex');sessions.set(hash(sid),{accessToken:match[1],expires:now()+900000});reply(200,{user:{id:user.id,name:user.name,role:user.role}},cookie(sid,900));return true;
   }
   if(path==='/hub-api/admin/logout'&&req.method==='POST'){const sid=token(req);if(sid)sessions.delete(hash(sid));reply(200,{ok:true},cookie('',0));return true}
   const user=await actor(req);
   if(path.startsWith('/hub-api/admin/loyalty/')){
    const sid=token(req),session=sid&&sessions.get(hash(sid));
    const subpath=path.slice('/hub-api/admin/loyalty'.length);
    const query=new URL(req.url,'http://internal').search;
    const payload=['POST','PATCH','PUT'].includes(req.method)?await body(req,32768):undefined;
    const result=await loyaltyAdminRequest({path:subpath,method:req.method,query,accessToken:session.accessToken,body:payload});
    reply(result.status,result.data);return true;
   }
   if(req.method==='GET'&&path==='/hub-api/admin/me')reply(200,{user:{id:user.id,name:user.name,role:user.role}});
   else if(req.method==='GET'&&path==='/hub-api/admin/analytics'){
    if(!analytics)throw new ContentError(503,'Аналитика не подключена');
    const params=new URL(req.url,'http://internal').searchParams,days=Number(params.get('days')||30),report=analytics.report(days,params.has('from')||params.has('to')?{from:params.get('from'),to:params.get('to')}:undefined),catalog=new Map(store.list('products').map(p=>[p.id,p])),blogTitles=new Map((blog?.list()||[]).map(a=>[a.slug,a.title]));
    reply(200,{...report,products:report.products.map(p=>({...p,name:catalog.get(p.id)?.name||'Товар #'+p.id,img:catalog.get(p.id)?.img||'/brand/logo.svg'})),blogArticles:report.blogArticles.map(a=>({...a,title:blogTitles.get(a.slug)||a.slug}))});
   }
   else if(req.method==='GET'&&path==='/hub-api/admin/search-analytics'){
    const access=process.env.YANDEX_WEBMASTER_TOKEN;
    if(!access){reply(200,{connected:false,reason:'Укажите YANDEX_WEBMASTER_TOKEN в настройках сервера'});return true}
    const base='https://api.webmaster.yandex.net/v4';
    const get=async endpoint=>{const response=await fetch(base+endpoint,{headers:{Authorization:'OAuth '+access,Accept:'application/json'},signal:AbortSignal.timeout(12000)});if(!response.ok){const failure=await response.json().catch(()=>({}));const code=String(failure.error_code||'');const reasons={HOST_NOT_VERIFIED:'Права на сайт не подтверждены для этого аккаунта Яндекса',HOST_NOT_INDEXED:'Сайт ещё не проиндексирован Яндексом',HOST_NOT_LOADED:'Яндекс ещё не загрузил данные сайта',HOST_NOT_FOUND:'Сайт не найден в Яндекс Вебмастере',INVALID_USER_ID:'Токен принадлежит другому пользователю'};if(response.status===401||response.status===403)throw new ContentError(502,reasons[code]||'Яндекс отклонил доступ. Проверьте OAuth-токен и права на сайт');if(response.status===404)throw new ContentError(502,reasons[code]||'Яндекс вернул 404 для данных сайта (код: '+(code||'не указан')+')');throw new ContentError(502,'Ошибка Яндекс Вебмастера: HTTP '+response.status+(code?' ('+code+')':''))}return response.json()};
    const identity=await get('/user'),uid=identity.user_id;
    if(!uid)throw new ContentError(502,'Яндекс не вернул ID пользователя');
    const hosts=await get('/user/'+encodeURIComponent(uid)+'/hosts');
    const sites=Array.isArray(hosts.hosts)?hosts.hosts:[];
    const host=sites.find(h=>{const raw=String(h.ascii_host_url||h.unicode_host_url||h.host_id||'');try{return new URL(raw).hostname.replace(/^www\./,'')==='sizey.ru'}catch{return /(^|[:/])sizey\.ru([/:]|$)/.test(raw)}});
    if(!host){reply(200,{connected:false,reason:'Сайт sizey.ru не найден среди доступных сайтов Яндекс Вебмастера'});return true}
    const id=encodeURIComponent(host.host_id);
    const params=new URLSearchParams({order_by:'TOTAL_SHOWS',limit:'100'});
    for(const metric of ['TOTAL_SHOWS','TOTAL_CLICKS','AVG_SHOW_POSITION'])params.append('query_indicator',metric);
    const data=await get('/user/'+encodeURIComponent(uid)+'/hosts/'+id+'/search-queries/popular?'+params);
    const rows=(Array.isArray(data.queries)?data.queries:[]).map(q=>{const indicators=q.indicators||{};const shows=Number(indicators.TOTAL_SHOWS)||0,clicks=Number(indicators.TOTAL_CLICKS)||0;return {query:String(q.query_text||''),shows,clicks,ctr:shows?clicks/shows*100:0,position:Number.isFinite(Number(indicators.AVG_SHOW_POSITION))?Number(indicators.AVG_SHOW_POSITION):null}}).filter(q=>q.query);
    reply(200,{connected:true,source:'Яндекс Вебмастер',period:'Последняя доступная неделя',rows}); 
   }
   else if(path==='/hub-api/admin/blog'&&req.method==='GET'){if(!blog)throw new ContentError(503,'Блог недоступен');reply(200,{articles:blog.list()})}
   else if(path==='/hub-api/admin/blog/save'&&req.method==='POST'){if(!blog)throw new ContentError(503,'Блог недоступен');const item=await body(req);const article=blog.save(item.article,item.id);store.audit(user.id,'blog-save',article.slug);reply(200,{article})}
   else if(path==='/hub-api/admin/blog/publish'&&req.method==='POST'){if(!blog)throw new ContentError(503,'Блог недоступен');const item=await body(req);if(typeof item.id!=='string'||typeof item.published!=='boolean')throw new ContentError(400,'Неверное действие');const article=blog.publish(item.id,item.published,store.list('products'));store.audit(user.id,'blog-publish',article.slug);reply(200,{article})}
   else if(path==='/hub-api/admin/blog/ideas'&&req.method==='GET'){if(!blogAI)throw new ContentError(503,'Qwen недоступен');reply(200,{ideas:await blogAI.discover(store.list('products'))})}
   else if(path==='/hub-api/admin/blog/generate'&&req.method==='POST'){
    if(!blogAI||!blog)throw new ContentError(503,'Qwen недоступен');
    const item=await body(req),topic=item.topic;
    if(typeof topic!=='string'||topic.trim().length<12||topic.length>140)throw new ContentError(400,'Тема должна содержать от 12 до 140 символов');
    cleanBlogJobs();
    if([...blogJobs.values()].some(j=>j.state==='running'&&j.owner===user.id))throw new ContentError(429,'Дождитесь завершения предыдущей генерации');
    const id=randomBytes(24).toString('hex'),job={owner:user.id,created:now(),state:'running'};
    blogJobs.set(id,job);
    void (async()=>{try{
     const result=await blogAI.generate({topic,products:store.list('products')});
     if(result.article){const article=blog.save(result.article);store.audit(user.id,'blog-ai-draft',article.slug);job.result={...result,article}}
     else job.result=result;
     job.state='done';
    }catch(e){job.state='failed';job.message=e instanceof ContentError?e.message:'Не удалось создать черновик. Проверьте доступность Qwen и повторите попытку.'}})();
    reply(202,{jobId:id,state:'running'});
   }
   else if(path==='/hub-api/admin/blog/generate/status'&&req.method==='GET'){
    cleanBlogJobs();
    const id=new URL(req.url,'http://internal').searchParams.get('id');
    const job=id&&blogJobs.get(id);
    if(!job||job.owner!==user.id)throw new ContentError(404,'Задача не найдена или срок хранения истёк');
    reply(200,{state:job.state,...(job.state==='done'?{result:job.result}:{}),...(job.state==='failed'?{message:job.message}:{})});
   }
   else if(path==='/hub-api/admin/ai/assistant'&&req.method==='POST'){
    if(!descriptionAI)throw new ContentError(503,'ИИ-помощник недоступен');
    const messages=assistantMessages(await body(req,65536),{store,blog,analytics});
    reply(200,await descriptionAI.assistant(messages,user.id));
   }
   else if(path==='/hub-api/admin/ai/status'&&req.method==='GET'){if(!descriptionAI)throw new ContentError(503,'AI не подключён');reply(200,await descriptionAI.status())}
   else if(path==='/hub-api/admin/ai/settings'&&req.method==='POST'){if(!descriptionAI)throw new ContentError(503,'AI не подключён');const result=await descriptionAI.configure(await body(req));store.audit(user.id,'configure-description-ai','OpenRouter');reply(200,result)}
   else if(path==='/hub-api/admin/ai/keywords'&&req.method==='GET'){if(!keywordSuggestions)throw new ContentError(503,'Подсказки недоступны');const q=new URL(req.url,'http://internal').searchParams.get('q');reply(200,await keywordSuggestions.suggest(q))}
   else if(path==='/hub-api/admin/ai/wordstat'&&req.method==='POST'){if(!descriptionAI)throw new ContentError(503,'AI не подключён');const result=await descriptionAI.wordstat(await body(req),user.id);store.audit(user.id,'wordstat-lookup','seo');reply(200,result)}
   else if(path==='/hub-api/admin/ai/seo'&&req.method==='POST'){if(!descriptionAI)throw new ContentError(503,'AI не подключён');const result=await descriptionAI.seo(await body(req),user.id);store.audit(user.id,'generate-seo-ai','seo');reply(200,result)}
   else if(path==='/hub-api/admin/ai/description'&&req.method==='POST'){if(!descriptionAI)throw new ContentError(503,'AI не подключён');const result=await descriptionAI.generate(await body(req),user.id);store.audit(user.id,'generate-description-ai','description');reply(200,result)}
   else if(req.method==='GET'&&path==='/hub-api/admin/summary')reply(200,{...store.summary(),clients:(await listClients()).length});
   else if(req.method==='GET'&&path==='/hub-api/admin/clients')reply(200,{clients:(await listClients()).map(c=>({id:c.id,name:c.name,phone:'+'+c.phone_normalized,loyalty:c.hasLoyalty!==false}))});
   else if(path==='/hub-api/admin/options'&&req.method==='GET')reply(200,{options:store.options()});
   else if(path==='/hub-api/admin/options'&&req.method==='POST')reply(200,store.mutateOptions(await body(req),user.id));
   else if(path==='/hub-api/admin/products/order'&&req.method==='POST')reply(200,store.moveProduct(await body(req),user.id));
   else if(req.method==='GET'&&path==='/hub-api/admin/orders')reply(200,{orders:store.orders()});
   else if(req.method==='GET'&&path==='/hub-api/admin/activity')reply(200,{activity:store.summary().recent});
   else if(req.method==='POST'&&path==='/hub-api/admin/images'){const value=storeImage(mediaDirectory,await body(req,4300000));store.audit(user.id,'upload-image',value.split('/').pop());reply(201,{url:value})}
   else {const match=/^\/hub-api\/admin\/(products|banners)(?:\/([\w-]+))?$/.exec(path);if(!match)throw new ContentError(404,'Раздел не найден');const kind=match[1],id=match[2];if(req.method==='GET'&&!id)reply(200,{[kind]:store.list(kind),...(kind==='products'?{orderRevision:store.orderRevision()}:{})});else if(req.method==='POST'){const b=await body(req);reply(id?200:201,{item:store.save(kind,b,user.id,kind==='products'&&id?Number(id):id)})}else throw new ContentError(405,'Метод не поддерживается')}
  }catch(error){reply(error instanceof ContentError?error.status:500,{message:error instanceof ContentError?error.message:'Не удалось выполнить запрос. Попробуйте позже.'})}
  return true;
 };
}
