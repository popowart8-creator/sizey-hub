import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createECDH,randomBytes,randomUUID} from 'node:crypto';
import {createServer} from 'node:http';
import webPush from 'web-push';
import {createAdmin} from './admin.mjs';
import {createPushStore,validPushPath} from './push.mjs';

function subscriber(name,analytics=true){
 const key=createECDH('prime256v1');
 return {
  endpoint:'https://web.push.apple.com/'+name,analytics,
  keys:{auth:randomBytes(16).toString('base64url'),p256dh:key.generateKeys().toString('base64url')}
 };
}

test('push sends each campaign once, encrypts valid payloads and reports unique client events',async()=>{
 const received=[];
 let now=Date.parse('2026-11-20T22:00:00Z');
 const push=createPushStore(':memory:',{
  now:()=>now,
  async send(subscription,payload,options){
   const request=webPush.generateRequestDetails(subscription,payload,options);
   assert.equal(request.headers['Content-Encoding'],'aes128gcm');
   if(subscription.endpoint.endsWith('/expired'))throw {statusCode:410};
   received.push(JSON.parse(payload));
  }
 });
 const normal=subscriber('normal'),privateSub=subscriber('private',false);
 const expired=subscriber('expired'),withdrawn=subscriber('withdrawn');
 for(const sub of [normal,privateSub,expired,withdrawn])push.subscribe(sub);
 assert.throws(()=>push.subscribe({...normal,endpoint:'https://web.push.apple.com.evil.invalid/push'}),{status:400});
 push.unsubscribe({...normal,keys:{...normal.keys,auth:randomBytes(16).toString('base64url')}});
 assert.equal(push.status().subscribers,4);
 const post={id:randomUUID(),title:'Новая коллекция',message:'Посмотрите каталог',path:'/?tab=catalog'};
 push.enqueue(post,'admin');
 push.enqueue(post,'admin');
 assert.throws(()=>push.enqueue({...post,title:'Другое название'},'admin'),{status:409});
 push.unsubscribe(withdrawn);
 await Promise.all([push.drain(),push.drain()]);
 assert.equal(received.length,2);
 const tracked=received.find(item=>item.id);
 assert.ok(tracked);
 assert.equal(received.filter(item=>item.id).length,1);
 now+=86400000;
 for(const kind of ['shown','shown','opened','opened'])push.record({kind,id:tracked.id});
 assert.equal(push.status().subscribers,2);
 assert.deepEqual({...push.report('2026-11-21','2026-11-21')},{
  campaigns:1,recipients:4,accepted:2,failed:1,skipped:1,pending:0,unknown:0,shown:1,opened:1
 });
 assert.equal(push.report('2026-11-20','2026-11-20').campaigns,0);
});

test('public subscription and admin push routes enforce separate origins and roles',async t=>{
 const push=createPushStore(':memory:',{send:async()=>{}});
 const user={id:'admin',name:'Admin',role:'ADMIN',status:'ACTIVE'};
 const handler=createAdmin({push,staffAuth:{login:async()=>({accessToken:'token',user}),me:async()=>user}});
 const server=createServer(handler);
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 const api='http://127.0.0.1:'+server.address().port+'/hub-api';
 const publicOrigin='https://hub.sizey.ru',adminOrigin='https://admmm.sizey.ru';
 const post=(path,data,origin,cookie)=>fetch(api+path,{method:'POST',headers:{
  Origin:origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})
 },body:JSON.stringify(data)});
 const sub=subscriber('device');
 assert.equal((await (await fetch(api+'/push/key')).json()).key,push.publicKey);
 assert.equal((await post('/push/subscribe',sub,adminOrigin)).status,403);
 assert.equal((await post('/push/subscribe',sub,publicOrigin)).status,200);
 assert.equal((await fetch(api+'/admin/push')).status,401);
 const campaign={id:randomUUID(),title:'Коллекция',message:'Смотрите новинки',path:'/'};
 assert.equal((await post('/admin/push',campaign,adminOrigin)).status,401);
 const login=await post('/admin/login',{login:'test',password:'test'},adminOrigin);
 const cookie=login.headers.get('set-cookie').split(';')[0];
 assert.equal((await post('/admin/push',campaign,publicOrigin,cookie)).status,403);
 assert.equal((await post('/admin/push',campaign,adminOrigin,cookie)).status,202);
 await push.drain();
 assert.equal((await (await fetch(api+'/admin/push',{headers:{Cookie:cookie}})).json()).campaigns[0].accepted,1);
});

 test('push destinations accept internal product deep links and reject external URLs',()=>{
 for(const path of ['/', '/?tab=cart', '/?tab=favorites', '/?tab=profile', '/?tab=wardrobe', '/?product=123', '/?blog=article'])assert.equal(validPushPath(path),true,path);
 for(const path of ['https://evil.test/', '//evil.test/', '/\\\\evil.test/', '/other', '/?x=1'])assert.equal(validPushPath(path),false,path);
 });

test('targeted campaigns reach only selected customers and create private inbox entries',async()=>{
 const received=[];
 const push=createPushStore(':memory:',{send:async(sub,payload)=>received.push({endpoint:sub.endpoint,payload:JSON.parse(payload)})});
 const alice=subscriber('alice'),bob=subscriber('bob');
 push.subscribe(alice);push.subscribe(bob);
 assert.equal(push.bind('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',alice),true);
 assert.equal(push.bind('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',bob),true);
 const campaign={id:randomUUID(),title:'Личное предложение',message:'Для вас',path:'/?tab=profile',audience:'selected',customers:['aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa']};
 push.enqueue(campaign,'admin');
 await push.drain();
 assert.equal(received.length,1);
 assert.equal(received[0].endpoint,alice.endpoint);
 assert.equal(push.inbox('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb').length,0);
 const notices=push.inbox('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
 assert.equal(notices.length,1);
 assert.equal(notices[0].read,0);
 push.markRead('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',notices[0].id);
 assert.equal(push.inbox('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')[0].read,1);
 assert.throws(()=>push.enqueue({...campaign,id:randomUUID(),customers:[]},'admin'),{status:400});
});
