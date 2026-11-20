// Narrow, server-side adapter to the existing SIZEY loyalty backend.
// Never forward browser Authorization headers or expose employee tokens.
const routes = [
  {pattern:/^\/clients$/, methods:['GET','POST'], upstream:'/api/clients'},
  {pattern:/^\/clients\/search$/, methods:['GET'], upstream:'/api/clients/search'},
  {pattern:/^\/clients\/([a-f0-9-]{36})$/i, methods:['GET','PATCH','DELETE'], upstream:'/api/clients/:id'},
  {pattern:/^\/clients\/([a-f0-9-]{36})\/transactions$/i, methods:['GET'], upstream:'/api/clients/:id/transactions'},
  {pattern:/^\/sales\/preview$/, methods:['POST'], upstream:'/api/sales/preview'},
  {pattern:/^\/sales$/, methods:['POST'], upstream:'/api/sales'},
  {pattern:/^\/sales\/manual-accrual$/, methods:['POST'], upstream:'/api/sales/manual-accrual'},
  {pattern:/^\/sales\/manual-debit$/, methods:['POST'], upstream:'/api/sales/manual-debit'},
  {pattern:/^\/sales\/refund$/, methods:['POST'], upstream:'/api/sales/refund'},
  {pattern:/^\/sales\/([a-f0-9-]{36})\/cancel$/i, methods:['POST'], upstream:'/api/sales/:id/cancel'},
  {pattern:/^\/users$/, methods:['GET','POST'], upstream:'/api/users'},
  {pattern:/^\/users\/([a-f0-9-]{36})$/i, methods:['GET','PATCH','DELETE'], upstream:'/api/users/:id'},
  {pattern:/^\/settings$/, methods:['GET','PATCH'], upstream:'/api/settings'}
];
// Financial writes are deliberately disabled until upstream DTOs, idempotency and audit are verified.
const financialWrites=new Set(['/sales','/sales/manual-accrual','/sales/manual-debit','/sales/refund']);
const settingKeys=new Set(['companyName','timezone','currency','currencySymbol','maxBonusSpendPercent','birthdayMultiplier']);
function validateSettings(body){
 if(!body||typeof body!=='object'||Array.isArray(body))return false;
 const entries=Object.entries(body);
 if(!entries.length||entries.some(([key])=>!settingKeys.has(key)))return false;
 return entries.every(([key,value])=>{
  if(key==='maxBonusSpendPercent')return typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=100;
  if(key==='birthdayMultiplier')return typeof value==='number'&&Number.isFinite(value)&&value>=1&&value<=100;
  return typeof value==='string'&&value.trim().length>0&&value.length<=128;
 });
}
function validateClientPatch(body){
 if(!body||typeof body!=='object'||Array.isArray(body))return false;
 const entries=Object.entries(body);
 if(!entries.length||entries.some(([key])=>!['name','phone','birthDate'].includes(key)))return false;
 return entries.every(([key,value])=>typeof value==='string'&&value.trim().length>0&&value.length<=160&&(key!=='birthDate'||(/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value)))));
}
export async function loyaltyAdminRequest({path,method,query='',accessToken,body,fetcher=fetch,base='http://sizey-prod-backend:4000'}){
  const route=routes.find(r=>r.pattern.test(path)&&r.methods.includes(method));
  if(!route)return {status:404,data:{message:'Операция бонусной системы не поддерживается'}};
  if(financialWrites.has(path)&&method==='POST')return {status:501,data:{message:'Финансовые операции будут доступны после проверки контрактов и защиты от повторных списаний'}};
  if(/^\/sales\/[a-f0-9-]{36}\/cancel$/i.test(path)&&method==='POST')return {status:501,data:{message:'Отмена продажи временно недоступна до проверки контракта'}};
  // Production ClientsController and UpdateClientDto were verified by the read-only contract inspection.
  const clientPatch=method==='PATCH'&&/^\/clients\/[a-f0-9-]{36}$/i.test(path);
  if(clientPatch&&!validateClientPatch(body))return {status:400,data:{message:'Некорректные данные клиента'}};
  // Other write DTOs have not been verified against the production NestJS source.
  if(['POST','PATCH','PUT','DELETE'].includes(method)&&!(path==='/settings'&&method==='PATCH')&&!clientPatch&&!(path==='/sales/preview'&&method==='POST'))
    return {status:501,data:{message:'Изменение данных ожидает проверки контракта действующей системы'}};
  if(path==='/settings'&&method==='PATCH'&&!validateSettings(body))
    return {status:400,data:{message:'Некорректные настройки программы лояльности'}};
  const match=route.pattern.exec(path);
  const endpoint=route.upstream.replace(':id',match?.[1]||'');
  // Only documented query parameters are accepted; never forward arbitrary upstream controls.
  if(query.length>2048)return {status:400,data:{message:'Слишком длинный запрос'}};
  const allowed=path==='/clients'?['all']:path==='/clients/search'?['q']:[];
  const params=new URLSearchParams(query);
  if(method!=='GET'&&query)return {status:400,data:{message:'Параметры запроса не поддерживаются'}};
  for(const [key,value] of params){
    if(!allowed.includes(key)||value.length>256)return {status:400,data:{message:'Недопустимый параметр запроса'}};
  }
  const target=base+endpoint+(method==='GET'&&params.size?'?'+params.toString():'');
  try{
    const response=await fetcher(target,{method,headers:{Authorization:'Bearer '+accessToken,...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(12000),redirect:'error',cache:'no-store'});
    const type=response.headers.get('content-type')||'';
    if(!type.includes('application/json'))return {status:502,data:{message:'Некорректный ответ бонусной системы'}};
    const data=await response.json();
    return {status:response.status,data};
  }catch{
    return {status:503,data:{message:'Бонусная система временно недоступна. Повторите запрос после проверки результата предыдущей операции.'}};
  }
}
