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
export async function loyaltyAdminRequest({path,method,query='',accessToken,body,fetcher=fetch,base='http://sizey-prod-backend:4000'}){
  const route=routes.find(r=>r.pattern.test(path)&&r.methods.includes(method));
  if(!route)return {status:404,data:{message:'Операция бонусной системы не поддерживается'}};
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
