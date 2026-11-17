import {DatabaseSync} from 'node:sqlite';
import {createAuth} from './auth.mjs';
import {loyaltyPool} from './loyalty.mjs';
const database=(process.env.DATA_DIR||'/data')+'/auth.sqlite';
const auth=createAuth({database,secret:process.env.AUTH_SECRET,origin:process.env.PUBLIC_ORIGIN});auth.close();
const pool=loyaltyPool(process.env.LOYALTY_DATABASE_URL);
const db=new DatabaseSync(database);
try{
 const{rows}=await pool.query('SELECT id,phone_normalized FROM clients WHERE deleted_at IS NULL');
 let imported=0,skipped=0;
 db.exec('BEGIN');
 try{
  const insert=db.prepare('INSERT INTO customers(id,phone,created) VALUES(?,?,?) ON CONFLICT(phone) DO NOTHING');
  for(const c of rows){if(!/^7\d{10}$/.test(c.phone_normalized)){skipped++;continue}imported+=Number(insert.run(c.id,'+'+c.phone_normalized,Date.now()).changes)}
  db.exec('COMMIT');
 }catch(e){db.exec('ROLLBACK');throw e}
 console.log(JSON.stringify({existingClients:rows.length,imported,skippedInvalidPhones:skipped}));
}finally{db.close();await pool.end()}
