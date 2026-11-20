import test from 'node:test';
import assert from 'node:assert/strict';
import {loyaltyAdminRequest} from './loyalty-admin.mjs';
const token='employee-token';
test('forwards only allowlisted routes with server employee token',async()=>{
 let seen;
 const fetcher=async(url,options)=>{seen={url,options};return {status:200,headers:new Headers({'content-type':'application/json'}),json:async()=>({ok:true})}};
 const result=await loyaltyAdminRequest({path:'/clients/search',query:'?q=abc',method:'GET',accessToken:token,fetcher});
 assert.deepEqual(result,{status:200,data:{ok:true}});
 assert.equal(seen.url,'http://sizey-prod-backend:4000/api/clients/search?q=abc');
 assert.equal(seen.options.headers.Authorization,'Bearer '+token);
 assert.equal(seen.options.redirect,'error');
});
test('rejects unknown routes without upstream access',async()=>{
 const fetcher=()=>{throw Error('must not be called')};
 const r=await loyaltyAdminRequest({path:'/auth/login',method:'POST',accessToken:token,fetcher});
 assert.equal(r.status,404);
});
test('rejects invalid financial mutations before calling backend',async()=>{
 let count=0;
 const r=await loyaltyAdminRequest({path:'/sales/manual-accrual',method:'POST',accessToken:token,body:{},fetcher:async()=>{count++;throw Error('offline')}});
 assert.equal(count,0);assert.equal(r.status,400);
});
test('rejects methods not supported by source API',async()=>{
 const r=await loyaltyAdminRequest({path:'/settings',method:'DELETE',accessToken:token});
 assert.equal(r.status,404);
});

test('rejects unapproved query controls',async()=>{
 let called=false;
 const fetcher=async()=>{called=true;throw Error('unexpected upstream call')};
 const r=await loyaltyAdminRequest({path:'/clients',method:'GET',query:'?role=ADMIN',accessToken:token,fetcher});
 assert.equal(r.status,400);assert.equal(called,false);
});
test('forwards settings PATCH without leaking browser headers',async()=>{
 let seen;
 const fetcher=async(url,options)=>{seen=options;return {status:200,headers:new Headers({'content-type':'application/json'}),json:async()=>({ok:true})}};
 const r=await loyaltyAdminRequest({path:'/settings',method:'PATCH',accessToken:token,body:{companyName:'SIZEY'},fetcher});
 assert.equal(r.status,200);assert.equal(seen.method,'PATCH');
 assert.equal(JSON.parse(seen.body).companyName,'SIZEY');
 assert.deepEqual(Object.keys(seen.headers).sort(),['Authorization','Content-Type'].sort());
});

test('sale cancellation forwards only the verified path without a request body',async()=>{
 let seen;
 const id='11111111-1111-4111-8111-111111111111';
 const fetcher=async(url,options)=>{seen={url,options};return {status:200,headers:new Headers({'content-type':'application/json'}),json:async()=>({ok:true})}};
 const r=await loyaltyAdminRequest({path:'/sales/'+id+'/cancel',method:'POST',accessToken:token,fetcher});
 assert.equal(r.status,200);assert.equal(seen.url,'http://sizey-prod-backend:4000/api/sales/'+id+'/cancel');assert.equal(seen.options.body,undefined);
 assert.equal((await loyaltyAdminRequest({path:'/sales/'+id+'/cancel',method:'POST',body:{reason:'unapproved'},accessToken:token,fetcher})).status,400);
});
test('upstream errors preserve status for authorized read routes',async()=>{
 const fetcher=async()=>({status:403,headers:new Headers({'content-type':'application/json'}),json:async()=>({message:'Недостаточно прав'})});
 const r=await loyaltyAdminRequest({path:'/settings',method:'GET',accessToken:token,fetcher});
 assert.equal(r.status,403);assert.equal(r.data.message,'Недостаточно прав');
});

test('employee deletion never reaches upstream',async()=>{
 let count=0;
 const fetcher=async()=>{count++;throw Error('unexpected upstream call')};
 for(const [path,method] of [['/users/11111111-1111-4111-8111-111111111111','DELETE']]){
  const r=await loyaltyAdminRequest({path,method,body:{name:'Test'},accessToken:token,fetcher});
  assert.equal(r.status,501);
 }
 assert.equal(count,0);
});
test('settings changes require recognized fields and bounded values',async()=>{
 let count=0;
 const fetcher=async()=>{count++;throw Error('unexpected upstream call')};
 for(const body of [{role:'ADMIN'},{maxBonusSpendPercent:150},{birthdayMultiplier:-1},{companyName:''},{levels:[]},{}]){
  const r=await loyaltyAdminRequest({path:'/settings',method:'PATCH',body,accessToken:token,fetcher});
  assert.equal(r.status,400);
 }
 assert.equal(count,0);
});

test('validated client updates reach the existing backend',async()=>{
 let sent;
 const fetcher=async(url,options)=>{sent={url,options};return {status:200,headers:new Headers({'content-type':'application/json'}),json:async()=>({id:'ok'})}};
 const id='11111111-1111-4111-8111-111111111111';
 const result=await loyaltyAdminRequest({path:'/clients/'+id,method:'PATCH',body:{name:'Тест',phone:'+79990000000'},accessToken:token,fetcher});
 assert.equal(result.status,200);
 assert.equal(sent.url,'http://sizey-prod-backend:4000/api/clients/'+id);
 assert.deepEqual(JSON.parse(sent.options.body),{name:'Тест',phone:'+79990000000'});
});
test('client edits reject unapproved fields and malformed data before upstream',async()=>{
 let calls=0;
 const fetcher=async()=>{calls++;throw Error('unexpected')};
 for(const body of [{bonusBalance:100},{name:''},{birthDate:'tomorrow'},{role:'ADMIN'},{},null]){
  const result=await loyaltyAdminRequest({path:'/clients/11111111-1111-4111-8111-111111111111',method:'PATCH',body,accessToken:token,fetcher});
  assert.equal(result.status,400);
 }
 assert.equal(calls,0);
});

test('employee create and update forward validated DTOs only',async()=>{
 const seen=[];const fetcher=async(url,options)=>{seen.push({url,options});return {status:200,headers:new Headers({'content-type':'application/json'}),json:async()=>({id:'ok'})}};
 const id='11111111-1111-4111-8111-111111111111';
 assert.equal((await loyaltyAdminRequest({path:'/users',method:'POST',body:{name:'Тест',login:'test',password:'secure-password-123',role:'CASHIER',status:'ACTIVE'},accessToken:token,fetcher})).status,200);
 assert.equal((await loyaltyAdminRequest({path:'/users/'+id,method:'PATCH',body:{name:'Новое имя',role:'ADMIN'},accessToken:token,fetcher})).status,200);
 assert.equal(seen.length,2);
 assert.equal(seen[0].url,'http://sizey-prod-backend:4000/api/users');
 assert.equal(seen[1].url,'http://sizey-prod-backend:4000/api/users/'+id);
});
test('employee mutations reject invalid DTOs without upstream access',async()=>{
 let calls=0;const fetcher=async()=>{calls++;throw Error('unexpected')};
 for(const body of [{name:'A',role:'OWNER'},{name:'A',login:'a',password:'short',role:'ADMIN'},{name:'A',login:'a',password:'long-password',role:'ADMIN',isSuperuser:true}]){
  assert.equal((await loyaltyAdminRequest({path:'/users',method:'POST',body,accessToken:token,fetcher})).status,400);
 }
 assert.equal(calls,0);
});

test('financial writes require a stable idempotency key and verified DTO fields',async()=>{
 const id='11111111-1111-4111-8111-111111111111',key='test-operation-key-0001';
 const seen=[];const fetcher=async(url,options)=>{seen.push({url,options});return {status:201,headers:new Headers({'content-type':'application/json'}),json:async()=>({ok:true})}};
 const cases=[
  ['/sales/manual-accrual',{clientId:id,amount:50,note:'Корректировка',idempotencyKey:key}],
  ['/sales/manual-debit',{clientId:id,amount:10,idempotencyKey:key}],
  ['/sales',{clientId:id,purchaseAmount:120.5,bonusSpent:20,idempotencyKey:key}],
  ['/sales/refund',{transactionId:id,note:'Возврат',idempotencyKey:key}]
 ];
 for(const [path,body] of cases)assert.equal((await loyaltyAdminRequest({path,method:'POST',body,accessToken:token,fetcher})).status,201);
 assert.equal(seen.length,4);
 for(const [path,body] of cases){
  assert.equal((await loyaltyAdminRequest({path,method:'POST',body:{...body,idempotencyKey:undefined},accessToken:token,fetcher})).status,400);
 }
 assert.equal(seen.length,4);
});

test('client creation accepts only name and phone and forwards to existing backend',async()=>{
 let sent;
 const fetcher=async(url,options)=>{sent={url,options};return {status:201,headers:new Headers({'content-type':'application/json'}),json:async()=>({id:'11111111-1111-4111-8111-111111111111'})}};
 const body={name:'Ирина',phone:'+79990000000'};
 const r=await loyaltyAdminRequest({path:'/clients',method:'POST',body,accessToken:token,fetcher});
 assert.equal(r.status,201);
 assert.equal(sent.url,'http://sizey-prod-backend:4000/api/clients');
 assert.deepEqual(JSON.parse(sent.options.body),body);
 for(const bad of [{name:'Ирина'},{name:'',phone:'+79990000000'},{...body,bonusBalance:100}]){
  assert.equal((await loyaltyAdminRequest({path:'/clients',method:'POST',body:bad,accessToken:token,fetcher})).status,400);
 }
});
