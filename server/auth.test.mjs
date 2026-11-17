import {test} from 'node:test';import assert from 'node:assert/strict';import {createAuth,normalizePhone} from './auth.mjs';
test('phone normalization rejects arbitrary identifiers',()=>{assert.equal(normalizePhone('8 (999) 123-45-67'),'+79991234567');assert.throws(()=>normalizePhone('admin'));assert.throws(()=>normalizePhone('+1 999 123 4567'))});
test('OTP is single-use; session protects loyalty; logout invalidates it',async()=>{
 let sent;let clock=1000000;const calls=[];const app=createAuth({database:':memory:',secret:'x'.repeat(40),origin:'https://hub.sizey.ru',now:()=>clock,sendSms:async(phone,code)=>{sent={phone,code}},loyalty:async phone=>{calls.push(phone);return{balance:321}}});
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+app.server.address().port;
 const post=(path,data,cookie,origin='https://hub.sizey.ru')=>fetch(base+path,{method:'POST',headers:{origin,'Content-Type':'application/json',...(cookie?{cookie}:{})},body:JSON.stringify(data)});
 try{
  assert.equal((await fetch(base+'/hub-api/loyalty?phone=+79990000000')).status,401);
  assert.equal((await post('/hub-api/auth/request-code',{phone:'+79991234567',consent:true},null,'https://evil.test')).status,403);
  const requested=await post('/hub-api/auth/request-code',{phone:'+79991234567',consent:true});const c=await requested.json();assert.equal(requested.status,200);assert.equal(c.code,undefined);assert.equal(sent.phone,'+79991234567');
  assert.equal((await post('/hub-api/auth/request-code',{phone:'+79991234567',consent:true})).status,429);
  assert.equal((await post('/hub-api/auth/verify',{challengeId:c.challengeId,code:'wrong'})).status,400);
  const verified=await post('/hub-api/auth/verify',{challengeId:c.challengeId,code:sent.code});assert.equal(verified.status,200);const rawCookie=verified.headers.get('set-cookie');assert.match(rawCookie,/HttpOnly; Secure; SameSite=Lax/);const cookie=rawCookie.split(';')[0];
  assert.equal((await post('/hub-api/auth/verify',{challengeId:c.challengeId,code:sent.code})).status,400);
  assert.equal((await fetch(base+'/hub-api/auth/me',{headers:{cookie}})).status,200);
  assert.deepEqual(await(await fetch(base+'/hub-api/loyalty?phone=+79990000000',{headers:{cookie}})).json(),{balance:321});assert.deepEqual(calls,['+79991234567']);
  await post('/hub-api/auth/logout',{},cookie);assert.equal((await fetch(base+'/hub-api/auth/me',{headers:{cookie}})).status,401);
  clock+=61000;const next=await(await post('/hub-api/auth/request-code',{phone:'+79991234567',consent:true})).json();clock+=300001;assert.equal((await post('/hub-api/auth/verify',{challengeId:next.challengeId,code:sent.code})).status,400);
 }finally{await new Promise(r=>app.server.close(r));app.close()}
});
test('five incorrect attempts exhaust code',async()=>{
 let code;const app=createAuth({database:':memory:',secret:'x'.repeat(40),origin:'https://hub.sizey.ru',sendSms:async(p,c)=>{code=c}});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+app.server.address().port;
 const post=async(path,b)=>fetch(base+path,{method:'POST',headers:{origin:'https://hub.sizey.ru','Content-Type':'application/json'},body:JSON.stringify(b)});
 try{const c=await(await post('/hub-api/auth/request-code',{phone:'+79991234567',consent:true})).json();for(let i=0;i<5;i++)assert.equal((await post('/hub-api/auth/verify',{challengeId:c.challengeId,code:'000000'})).status,400);assert.equal((await post('/hub-api/auth/verify',{challengeId:c.challengeId,code})).status,400)}finally{await new Promise(r=>app.server.close(r));app.close()}
});
test('unconfigured SMS provider fails closed without issuing a code',async()=>{
 const app=createAuth({database:':memory:',secret:'x'.repeat(40),origin:'https://hub.sizey.ru'});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
 try{const r=await fetch('http://127.0.0.1:'+app.server.address().port+'/hub-api/auth/request-code',{method:'POST',headers:{origin:'https://hub.sizey.ru','Content-Type':'application/json'},body:JSON.stringify({phone:'+79991234567',consent:true})});assert.equal(r.status,503);assert.equal((await r.json()).code,undefined)}finally{await new Promise(r=>app.server.close(r));app.close()}
});
