import {mkdirSync,chmodSync} from 'node:fs';
import {createAuth,smsRu} from './auth.mjs';
const directory=process.env.DATA_DIR||'/data';mkdirSync(directory,{recursive:true,mode:0o700});
const database=directory+'/auth.sqlite';
const app=createAuth({database,secret:process.env.AUTH_SECRET,origin:process.env.PUBLIC_ORIGIN||'https://hub.sizey.ru',sendSms:process.env.SMS_RU_API_ID?smsRu(process.env.SMS_RU_API_ID):null});
chmodSync(database,0o600);
app.server.listen(8080,'0.0.0.0',()=>console.log('SIZEY customer auth listening on 8080'));
