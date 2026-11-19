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
test('does not retry failed financial mutations',async()=>{
 let count=0;
 const r=await loyaltyAdminRequest({path:'/sales/manual-accrual',method:'POST',accessToken:token,body:{},fetcher:async()=>{count++;throw Error('offline')}});
 assert.equal(count,1);assert.equal(r.status,503);
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
