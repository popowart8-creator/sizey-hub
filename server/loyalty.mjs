import pg from 'pg';
import {normalizePhone} from './auth.mjs';
const labels={PURCHASE:'Покупка',MANUAL_ACCRUAL:'Начисление бонусов',MANUAL_DEBIT:'Списание бонусов',REFUND:'Возврат',ADJUSTMENT:'Корректировка бонусов'};
export function createLoyaltyReader(pool){return async phone=>{
 const normalized=normalizePhone(phone).slice(1);
 const db=await pool.connect();
 try{
  await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const {rows}=await db.query(`SELECT c.id,c.name,l.name AS level,l.percent,
   COALESCE((SELECT SUM(b.remaining_amount) FROM bonus_lots b WHERE b.client_id=c.id AND b.remaining_amount>0 AND b.expires_at>NOW()),0)::integer AS balance
   FROM clients c LEFT JOIN loyalty_levels l ON l.id=c.loyalty_level_id WHERE c.phone_normalized=$1 AND c.deleted_at IS NULL LIMIT 2`,[normalized]);
  if(rows.length>1)throw new Error('Ambiguous loyalty phone');
  if(!rows.length){await db.query('COMMIT');return{linked:false,balance:null,history:[]}}
  const c=rows[0];
  const result=await db.query('SELECT id,type,balance_before,balance_after,created_at FROM transactions WHERE client_id=$1 ORDER BY created_at DESC,id DESC LIMIT 50',[c.id]);
  await db.query('COMMIT');
  return{linked:true,clientId:c.id,name:c.name,balance:Number(c.balance),level:c.level,percent:Number(c.percent),history:result.rows.map(t=>({id:t.id,amount:t.balance_after-t.balance_before,description:labels[t.type]||'Бонусная операция',date:new Date(t.created_at).toISOString()}))};
 }catch(e){await db.query('ROLLBACK').catch(()=>{});throw e}finally{db.release()}
}}
export function loyaltyPool(connectionString){return new pg.Pool({connectionString,max:3,connectionTimeoutMillis:5000,idleTimeoutMillis:30000,statement_timeout:5000,options:'-c default_transaction_read_only=on'})}
