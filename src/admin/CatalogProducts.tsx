import {useEffect,useMemo,useState,type DragEvent} from 'react';
import {ArrowDown,ArrowUp,Copy,GripVertical,LoaderCircle,Search,Trash2} from 'lucide-react';
import type {AdminRequest,Product} from './editor-types';
import './catalog-products.css';
import useAdminDialog from './useAdminDialog';
function ConfirmProductRemoval({product,busy,error,onCancel,onConfirm}:{
 product:Product;busy:boolean;error:string;onCancel:()=>void;onConfirm:()=>void;
}){
 const root=useAdminDialog(onCancel,busy);
 return <div className="editor-overlay cp-confirm-overlay" onClick={e=>{if(e.target===e.currentTarget&&!busy)onCancel()}}>
  <section className="editor cp-confirm" ref={root} role="alertdialog" aria-modal="true" aria-labelledby="cp-remove-title" aria-describedby="cp-remove-description">
   <h2 id="cp-remove-title">Удалить товар?</h2>
   <p id="cp-remove-description">«{product.name}» будет удалён из каталога. Это действие нельзя отменить.</p>
   {error&&<p role="alert" className="notice error">{error}</p>}
   <div className="cp-confirm-actions">
    <button type="button" className="secondary" data-autofocus disabled={busy} onClick={onCancel}>Отмена</button>
    <button type="button" className="cp-delete-confirm" disabled={busy} onClick={onConfirm}>{busy?'Удаляем…':'Удалить'}</button>
   </div>
  </section>
 </div>;
}
export default function CatalogProducts({products,revision,loading,request,onProducts,onRevision,onEdit,onSessionError}:{products:Product[];revision:number;loading:boolean;request:AdminRequest;onProducts:(p:Product[])=>void;onRevision:(n:number)=>void;onEdit:(p:Product)=>void;onSessionError:(e:unknown)=>void}){
 const[query,setQuery]=useState(''),[status,setStatus]=useState('all'),[category,setCategory]=useState('Все'),[moving,setMoving]=useState(false),[dragged,setDragged]=useState<number|null>(null),[over,setOver]=useState<number|null>(null),[error,setError]=useState('');const categories=useMemo(()=>[...new Set(products.flatMap(p=>p.categories))],[products]);
 const [removing,setRemoving]=useState<Product|null>(null);
 const [deleting,setDeleting]=useState(false);
 const [deleteError,setDeleteError]=useState('');
 const filtered=products.filter(p=>(p.name+' '+p.categories.join(' ')).toLocaleLowerCase('ru').includes(query.toLocaleLowerCase('ru'))&&(status==='all'||p.published===(status==='published'))&&(category==='Все'||p.categories.includes(category))),disabled=loading||moving||deleting;
 useEffect(()=>{if(category!=='Все'&&!categories.includes(category))setCategory('Все')},[category,categories]);
 async function reload(){try{const data=await request<{products:Product[];orderRevision:number}>('/products');onProducts(data.products);onRevision(data.orderRevision)}catch(e){setError((e as Error).message);if((e as {status:number}).status===401)onSessionError(e)}}
 async function move(id:number,target:number){if(disabled||id===target)return;const from=products.findIndex(p=>p.id===id),to=products.findIndex(p=>p.id===target);if(from<0||to<0)return;const beforeId=from<to?products[to+1]?.id??null:target;const previous=products,next=products.filter(p=>p.id!==id),position=beforeId===null?next.length:next.findIndex(p=>p.id===beforeId);next.splice(position,0,products[from]);onProducts(next);setMoving(true);setDragged(null);setOver(null);setError('');try{const data=await request<{products:Product[];orderRevision:number}>('/products/order',{id,beforeId,revision});onProducts(data.products);onRevision(data.orderRevision)}catch(e){onProducts(previous);setError((e as Error).message);if((e as {status:number}).status===409)await reload();if((e as {status:number}).status===401)onSessionError(e)}finally{setMoving(false)}}
 async function removeProduct(product:Product){
  if(disabled)return;
  setDeleting(true);
  setDeleteError('');
  setError('');
  try{
   const data=await request<{products:Product[];orderRevision:number}>('/products/delete',{id:product.id,version:product.version});
   onProducts(data.products);
   onRevision(data.orderRevision);
   setRemoving(null);
  }catch(e){
   const status=(e as {status?:number}).status;
   if(status===401)onSessionError(e);
   if(status===404||status===409){
    setRemoving(null);
    setError((e as Error).message);
    await reload();
   }else setDeleteError((e as Error).message);
  }finally{setDeleting(false)}
 }

 function duplicate(product:Product){
  onEdit({...product,id:0,version:0,updated:0,published:true,name:product.name.slice(0,192).trimEnd()+' (копия)'});
 }

 function drop(e:DragEvent,id:number){if(!e.dataTransfer.types.includes('text/sizey-product'))return;e.preventDefault();setOver(null);void move(Number(e.dataTransfer.getData('text/sizey-product')),id)}
 return <section className="panel cp-panel"><div className="cp-tools"><div className="cp-search"><Search size={17}/><input aria-label="Поиск товаров" placeholder="Название или категория" value={query} onChange={e=>setQuery(e.target.value)}/></div><span className="cp-result">{filtered.length} товаров</span></div>
 <div className="cp-status-chips" aria-label="Статус товаров">{[['all','Все',products.length],['published','На витрине',products.filter(p=>p.published).length],['draft','Черновики',products.filter(p=>!p.published).length]].map(([key,label,count])=><button type="button" key={key} aria-pressed={status===key} onClick={()=>setStatus(String(key))}>{label}<span>{count}</span></button>)}</div>
 <div className="cp-category-chips" aria-label="Категории товаров">{['Все',...categories].map(value=><button type="button" key={value} aria-pressed={category===value} onClick={()=>setCategory(value)}>{value==='Все'?'Все категории':value}</button>)}</div>
 <div className="cp-order-hint">{moving?<><LoaderCircle size={13} className="cp-spinner"/>Сохраняем порядок…</>:<><GripVertical size={13}/>Новые товары сверху · перетаскивайте за значок для изменения порядка<span>Одинаково в админке и Hub</span></>}</div>
 {error&&<div className="notice error" role="alert">{error}<button type="button" onClick={()=>void reload()}>Обновить список</button></div>}
 <div className="table-wrap"><table><thead><tr><th className="cp-handle-col"/><th>Товар</th><th>Категория</th><th>Цена</th><th>Размеры</th><th>Статус</th><th scope="col">Действия</th></tr></thead><tbody>{filtered.map((p,index)=><tr key={p.id} className={(dragged===p.id?'is-dragged ':'')+(over===p.id?'is-drop-target':'')} onClick={()=>{if(!disabled)onEdit(p)}} onDragOver={e=>{if(!disabled&&e.dataTransfer.types.includes('text/sizey-product')){e.preventDefault();e.dataTransfer.dropEffect='move';setOver(p.id)}}} onDragLeave={()=>setOver(old=>old===p.id?null:old)} onDrop={e=>drop(e,p.id)}>
 <td className="cp-handle-col"><div className="cp-move-controls" onClick={e=>e.stopPropagation()}><button type="button" className="cp-drag-handle" draggable={!disabled} disabled={disabled} aria-label={'Перетащить '+p.name} title="Перетащить товар" onDragStart={e=>{e.stopPropagation();e.dataTransfer.setData('text/sizey-product',String(p.id));e.dataTransfer.effectAllowed='move';setDragged(p.id)}} onDragEnd={()=>{setDragged(null);setOver(null)}}><GripVertical size={17}/></button><button type="button" aria-label={'Поднять '+p.name} disabled={disabled||index===0} onClick={()=>void move(p.id,filtered[index-1].id)}><ArrowUp size={12}/></button><button type="button" aria-label={'Опустить '+p.name} disabled={disabled||index===filtered.length-1} onClick={()=>void move(p.id,filtered[index+1].id)}><ArrowDown size={12}/></button></div></td>
 <td><div className="table-product"><img src={p.img} alt="" loading="lazy"/><button type="button" className="cp-edit-product" disabled={disabled} onClick={e=>{e.stopPropagation();onEdit(p)}}>{p.name}<small>#{p.id}</small></button></div></td><td>{p.categories[0]}</td><td className="price-cell">{p.price.toLocaleString('ru-RU')} ₽</td><td>{p.sizes.join(', ')}</td><td><span className={'badge '+(p.published?'published':'draft')}>{p.published?'На витрине':'Черновик'}</span></td><td><div className="cp-row-actions" onClick={e=>e.stopPropagation()}>
  <button type="button" className="icon-button" aria-label={'Дублировать '+p.name} title="Дублировать товар" disabled={disabled} onClick={()=>duplicate(p)}><Copy size={18} aria-hidden="true"/></button>
  <button type="button" className="icon-button cp-delete" aria-label={'Удалить '+p.name} aria-haspopup="dialog" title="Удалить товар" disabled={disabled} onClick={()=>{setDeleteError('');setRemoving(p)}}><Trash2 size={18} aria-hidden="true"/></button>
 </div></td></tr>)}</tbody></table></div>
 {!filtered.length&&<div className="quiet-empty">Товары не найдены{(query||status!=='all'||category!=='Все')&&<button type="button" onClick={()=>{setQuery('');setCategory('Все');setStatus('all')}}>Сбросить фильтры</button>}</div>}
 {removing&&<ConfirmProductRemoval product={removing} busy={deleting} error={deleteError} onCancel={()=>setRemoving(null)} onConfirm={()=>void removeProduct(removing)}/>}
 </section>
}
