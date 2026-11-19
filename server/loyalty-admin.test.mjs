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
test('blocks unverified financial mutations before calling backend',async()=>{
 let count=0;
 const r=await loyaltyAdminRequest({path:'/sales/manual-accrual',method:'POST',accessToken:token,body:{},fetcher:async()=>{count++;throw Error('offline')}});
 assert.equal(count,0);assert.equal(r.status,501);
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

test('financial cancel is also blocked before upstream access',async()=>{
 let called=false;
 const r=await loyaltyAdminRequest({path:'/sales/11111111-1111-4111-8111-111111111111/cancel',method:'POST',accessToken:token,fetcher:async()=>{called=true;throw Error('unexpected')}});
 assert.equal(r.status,501);assert.equal(called,false);
});
test('upstream errors preserve status for authorized read routes',async()=>{
 const fetcher=async()=>({status:403,headers:new Headers({'content-type':'application/json'}),json:async()=>({message:'Недостаточно прав'})});
 const r=await loyaltyAdminRequest({path:'/settings',method:'GET',accessToken:token,fetcher});
 assert.equal(r.status,403);assert.equal(r.data.message,'Недостаточно прав');
});

test('unverified employee and client mutations never reach upstream',async()=>{
 let count=0;
 const fetcher=async()=>{count++;throw Error('unexpected upstream call')};
 for(const [path,method] of [['/clients','POST'],['/clients/11111111-1111-4111-8111-111111111111','PATCH'],['/users','POST'],['/users/11111111-1111-4111-8111-111111111111','DELETE']]){
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

test('bonus spend limit must be at least one percent',async()=>{
 let calls=0;
 const fetcher=async()=>{calls++;throw Error('unexpected upstream call')};
 for(const value of [0,-1,101,NaN]){
  const result=await loyaltyAdminRequest({path:'/settings',method:'PATCH',body:{maxBonusSpendPercent:value},accessToken:token,fetcher});
  assert.equal(result.status,400);
 }
 assert.equal(calls,0);
});
