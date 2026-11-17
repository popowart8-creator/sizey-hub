import {initializeDatabase,credentialEnvelope} from './auth.mjs';
import {hashPassword,temporaryPassword} from './passwords.mjs';
const db=initializeDatabase((process.env.DATA_DIR||'/data')+'/auth.sqlite');
const envelope=credentialEnvelope(process.env.AUTH_SECRET);let generated=0;
try{
 const users=db.prepare('SELECT c.id FROM customers c LEFT JOIN credentials k ON k.customer=c.id WHERE k.customer IS NULL').all();
 for(const user of users){const password=temporaryPassword(),hash=await hashPassword(password);const result=db.prepare('INSERT OR IGNORE INTO credentials(customer,password_hash,must_change,phone_verified,temporary_encrypted) VALUES(?,?,1,1,?)').run(user.id,hash,envelope.seal(password));generated+=Number(result.changes)}
 // Revoke legacy SMS sessions on first password migration only.
 db.exec('CREATE TABLE IF NOT EXISTS migrations(name TEXT PRIMARY KEY)');
 if(!db.prepare('SELECT 1 FROM migrations WHERE name=?').get('password-auth-v1')){db.exec('DELETE FROM sessions');db.prepare('INSERT INTO migrations VALUES(?)').run('password-auth-v1')}
 console.log(JSON.stringify({temporaryPasswordsCreated:generated,totalCredentials:db.prepare('SELECT COUNT(*) AS n FROM credentials').get().n}));
}finally{db.close()}
