import {randomBytes,scrypt,timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
const derive=promisify(scrypt);
const parameters={N:32768,r:8,p:1,maxmem:64*1024*1024};
export function validPassword(value){return typeof value==='string'&&value.length>=10&&value.length<=128&&Buffer.byteLength(value,'utf8')<=256}
export function temporaryPassword(){return randomBytes(15).toString('base64url')}
export async function hashPassword(password){
 if(!validPassword(password))throw new Error('Пароль должен содержать от 10 до 128 символов');
 const salt=randomBytes(16);const key=await derive(password,salt,64,parameters);
 return 'scrypt-v1$'+salt.toString('hex')+'$'+key.toString('hex');
}
export async function verifyPassword(password,encoded){
 if(!validPassword(password)||typeof encoded!=='string')return false;
 const match=/^scrypt-v1\$([a-f0-9]{32})\$([a-f0-9]{128})$/.exec(encoded);
 if(!match)return false;
 const key=await derive(password,Buffer.from(match[1],'hex'),64,parameters);
 return timingSafeEqual(key,Buffer.from(match[2],'hex'));
}
