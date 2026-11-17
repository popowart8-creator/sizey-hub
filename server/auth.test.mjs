import{test}from'node:test';import assert from'node:assert/strict';import{mkdtempSync,rmSync}from'node:fs';import{tmpdir}from'node:os';import{join}from'node:path';
import{createAuth,initializeDatabase,normalizePhone,credentialEnvelope}from'./auth.mjs';import{hashPassword,verifyPassword}from'./passwords.mjs';
const phone='+79991234567',temporary='Individual-temporary-2026',changed='Customer-new-password-2026',secret='x'.repeat(40);
async function fixture(){
 const dir=mkdtempSync(join(tmpdir(),'sizey-auth-')),database=join(dir,'auth.sqlite'),db=initializeDatabase(database);
 db.prepare('INSERT INTO customers VALUES(?,?,?)').run('client-1',phone,1);db.prepare('INSERT INTO credentials(customer,password_hash,must_change,phone_verified,temporary_encrypted) VALUES(?,?,1,1,?)').run('client-1',await hashPassword(temporary),credentialEnvelope(secret).seal(temporary));db.close();
 let staffActive=true,clock=1000000;const calls=[];
 const app=createAuth({database,secret,origin:'https://hub.sizey.ru',now:()=>clock,loyalty:async p=>{calls.push(p);return p===phone?{linked:true,balance:321,history:[]}:{linked:false,balance:null,history:[]}},listLoyaltyCustomers:async()=>[{id:'client-1',name:'Customer',phone_normalized:phone.slice(1)}],staffAuth:{login:async(login,password)=>{if(login!=='employee'||password!=='employee-password')throw Error();return{accessToken:'internal-token',user:{id:'employee-1',name:'Employee',role:'EMPLOYEE'}}},me:async()=>{if(!staffActive)throw Error();return{id:'employee-1',name:'Employee',role:'EMPLOYEE'}}}});
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+app.server.address().port;
 const post=(path,data,cookie,origin='https://hub.sizey.ru')=>fetch(base+path,{method:'POST',headers:{origin,'Content-Type':'application/json',...(cookie?{cookie}:{})},body:JSON.stringify(data)});
 const get=(path,cookie)=>fetch(base+path,{headers:cookie?{cookie}:{}});
 return{post,get,calls,database,revokeStaff:()=>{staffActive=false},advance:()=>{clock+=900001},async close(){await new Promise(r=>app.server.close(r));app.close();rmSync(dir,{recursive:true,force:true})}};
}
const cookie=r=>r.headers.get('set-cookie')?.split(';')[0];
test('phone normalization rejects arbitrary identifiers',()=>{assert.equal(normalizePhone('8 (999) 123-45-67'),phone);assert.throws(()=>normalizePhone('admin'));assert.throws(()=>normalizePhone('+1 999 123 4567'))});
test('temporary password requires change; rotation revokes sessions; logout invalidates new session',async()=>{const f=await fixture();try{
 assert.equal((await f.get('/hub-api/loyalty')).status,401);
 assert.equal((await f.post('/hub-api/auth/login',{phone,password:temporary},null,'https://evil.test')).status,403);
 assert.equal((await f.post('/hub-api/auth/login',{phone,password:'wrong-password'})).status,401);
 const login=await f.post('/hub-api/auth/login',{phone,password:temporary});assert.equal(login.status,200);assert.equal((await login.json()).user.mustChangePassword,true);assert.match(login.headers.get('set-cookie'),/HttpOnly; Secure; SameSite=Lax/);const old=cookie(login);
 assert.equal((await f.get('/hub-api/loyalty',old)).status,403);
 const change=await f.post('/hub-api/auth/change-password',{currentPassword:temporary,newPassword:changed},old);assert.equal(change.status,200);const current=cookie(change);assert.equal((await change.json()).user.mustChangePassword,false);
 assert.equal((await f.get('/hub-api/auth/me',old)).status,401);
 assert.equal((await f.post('/hub-api/auth/login',{phone,password:temporary})).status,401);
 assert.equal((await f.get('/hub-api/loyalty?phone=+79990000000',current)).status,200);assert.deepEqual(f.calls,[phone]);
 await f.post('/hub-api/auth/logout',{},current);assert.equal((await f.get('/hub-api/auth/me',current)).status,401);
}finally{await f.close()}});
test('registration cannot overwrite existing clients and unverified new phones cannot see loyalty',async()=>{const f=await fixture();try{
 assert.equal((await f.post('/hub-api/auth/register',{phone,password:changed,consent:true})).status,409);
 const r=await f.post('/hub-api/auth/register',{phone:'+79991112233',password:changed,consent:true});assert.equal(r.status,201);const c=cookie(r);assert.equal((await r.json()).user.phoneVerified,false);
 const calls=f.calls.length;assert.deepEqual(await(await f.get('/hub-api/loyalty',c)).json(),{linked:false,pendingVerification:true,balance:null,history:[]});assert.equal(f.calls.length,calls);
 assert.equal((await f.post('/hub-api/auth/request-code',{phone,consent:true})).status,404);
}finally{await f.close()}});
test('staff-only delivery consumes encrypted initial password, reset revokes customer sessions',async()=>{const f=await fixture();try{
 assert.equal((await f.get('/hub-api/staff/customers')).status,401);assert.equal((await f.post('/hub-api/staff/issue-password',{phone,identityChecked:true})).status,401);
 const login=await f.post('/hub-api/staff/login',{login:'employee',password:'employee-password'}),s=cookie(login);assert.equal(login.status,200);assert.equal(JSON.stringify(await login.json()).includes('internal-token'),false);
 const list=await(await f.get('/hub-api/staff/customers',s)).json();assert.equal(list.customers[0].temporaryPasswordPending,true);assert.equal(JSON.stringify(list).includes(temporary),false);
 assert.equal((await f.post('/hub-api/staff/issue-password',{phone},s)).status,400);
 const issue=await f.post('/hub-api/staff/issue-password',{phone,identityChecked:true},s);assert.equal(issue.status,200);assert.equal((await issue.json()).temporaryPassword,temporary);
 const customerLogin=await f.post('/hub-api/auth/login',{phone,password:temporary});const customer=cookie(customerLogin);
 const reset=await(await f.post('/hub-api/staff/issue-password',{phone,identityChecked:true},s)).json();assert.notEqual(reset.temporaryPassword,temporary);assert.equal((await f.get('/hub-api/auth/me',customer)).status,401);
 const db=initializeDatabase(f.database),record=db.prepare('SELECT * FROM credentials').get();assert.equal(record.temporary_encrypted,null);assert.equal(await verifyPassword(reset.temporaryPassword,record.password_hash),true);db.close();
 f.revokeStaff();assert.equal((await f.get('/hub-api/staff/customers',s)).status,401);
}finally{await f.close()}});
test('password attempts are rate-limited',async()=>{const f=await fixture();try{for(let i=0;i<10;i++)assert.equal((await f.post('/hub-api/auth/login',{phone,password:'wrong-password'})).status,401);assert.equal((await f.post('/hub-api/auth/login',{phone,password:temporary})).status,429);f.advance();assert.equal((await f.post('/hub-api/auth/login',{phone,password:temporary})).status,200)}finally{await f.close()}});
