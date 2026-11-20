import {useState,type FormEvent} from 'react';
type Operation='manual-accrual'|'manual-debit'|'sale'|'refund'|'cancel';
type Props={clientId:string;transactions:Array<{id?:string;type?:string;amount?:number;createdAt?:string}>;onComplete:()=>void;onExpired:()=>void};
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
export default function ClientFinancialActions({clientId,transactions,onComplete,onExpired}:Props){
 const [operation,setOperation]=useState<Operation>('manual-accrual');
 const [amount,setAmount]=useState(''),[spent,setSpent]=useState('0'),[note,setNote]=useState('');
 const [transactionId,setTransactionId]=useState(''),[pending,setPending]=useState(false),[error,setError]=useState(''),[success,setSuccess]=useState('');
 const [key,setKey]=useState(()=>crypto.randomUUID()),[completed,setCompleted]=useState(false);
 const change=(next:Operation)=>{setOperation(next);setAmount('');setSpent('0');setNote('');setTransactionId('');setError('');setSuccess('');setKey(crypto.randomUUID());setCompleted(false)};
 async function submit(event:FormEvent){event.preventDefault();if(pending||completed)return;
  const count=Number(amount),bonus=Number(spent);
  if(operation==='sale'&&(!Number.isFinite(count)||count<=0||Math.abs(Math.round(count*100)-count*100)>1e-7||!Number.isSafeInteger(bonus)||bonus<0)){setError('Проверьте сумму продажи и списываемые бонусы');return}
  if((operation==='manual-accrual'||operation==='manual-debit')&&(!Number.isSafeInteger(count)||count<=0)){setError('Укажите целое положительное количество бонусов');return}
  if((operation==='refund'||operation==='cancel')&&!uuid.test(transactionId.trim())){setError('Выберите операцию с корректным идентификатором');return}
  const body=operation==='sale'?{clientId,purchaseAmount:count,bonusSpent:bonus,idempotencyKey:key}:operation==='manual-accrual'||operation==='manual-debit'?{clientId,amount:count,note,idempotencyKey:key}:operation==='refund'?{transactionId:transactionId.trim(),note,idempotencyKey:key}:undefined;
  const path=operation==='sale'?'/sales':operation==='manual-accrual'?'/sales/manual-accrual':operation==='manual-debit'?'/sales/manual-debit':operation==='refund'?'/sales/refund':'/sales/'+transactionId.trim()+'/cancel';
  if(!window.confirm('Подтвердить операцию? Она изменит реальные данные бонусной системы.'))return;
  setPending(true);setError('');setSuccess('');
  try{
   const response=await fetch('/hub-api/admin/loyalty'+path,{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
   const result=await response.json();
   if(!response.ok)throw Object.assign(new Error(result.message||'Операция не выполнена'),{status:response.status});
   setCompleted(true);setSuccess('Операция выполнена. Обновите карточку, чтобы увидеть актуальный баланс и историю.');onComplete();
  }catch(e){const err=e as Error&{status?:number};if(err.status===401)onExpired();setError(err.message+' Если результат неизвестен, проверьте историю перед повтором. Повтор использует тот же ключ операции.')}
  finally{setPending(false)}
 }
 return <section style={{display:'grid',gap:12,marginTop:24}}><h3>Бонусы, продажи и возвраты</h3>
  <label>Действие<select value={operation} onChange={e=>change(e.target.value as Operation)} disabled={pending}>
   <option value="manual-accrual">Начислить бонусы</option><option value="manual-debit">Списать бонусы</option><option value="sale">Создать продажу</option><option value="refund">Возврат по операции</option><option value="cancel">Отменить продажу</option>
  </select></label>
  <form onSubmit={submit} style={{display:'grid',gap:10}}>
   {(operation==='manual-accrual'||operation==='manual-debit'||operation==='sale')&&<label>{operation==='sale'?'Сумма покупки':'Количество бонусов'}<input required type="number" min={operation==='sale'?'0.01':'1'} step={operation==='sale'?'0.01':'1'} value={amount} onChange={e=>setAmount(e.target.value)}/></label>}
   {operation==='sale'&&<label>Оплатить бонусами<input required type="number" min="0" step="1" value={spent} onChange={e=>setSpent(e.target.value)}/></label>}
   {(operation==='refund'||operation==='cancel')&&<label>Операция из истории<select required value={transactionId} onChange={e=>setTransactionId(e.target.value)}><option value="">Выберите операцию</option>{transactions.filter(t=>t.id&&uuid.test(t.id)).map(t=><option key={t.id} value={t.id}>{t.type||'Операция'} · {t.amount??'—'} · {t.createdAt?new Date(t.createdAt).toLocaleString('ru-RU'):t.id}</option>)}</select></label>}
   {(operation==='manual-accrual'||operation==='manual-debit'||operation==='refund')&&<label>Комментарий<input maxLength={500} value={note} onChange={e=>setNote(e.target.value)}/></label>}
   {error&&<div className="notice error" role="alert">{error}</div>}{success&&<div className="notice" role="status">{success}</div>}
   <button className="primary" disabled={pending||completed}>{pending?'Выполнение…':completed?'Операция выполнена':'Подтвердить '+({ 'manual-accrual':'начисление','manual-debit':'списание',sale:'продажу',refund:'возврат',cancel:'отмену'}[operation])}</button>
   {completed&&<button type="button" className="secondary" onClick={()=>change(operation)}>Новая операция</button>}
  </form></section>;
}
