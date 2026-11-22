import {X} from 'lucide-react';
import type {Choice,ChoiceKind} from './editor-types';
export default function ChoicePicker({kind,selected,choices,onChange,disabled}:{kind:ChoiceKind;selected:string[];choices:Choice[];onChange:(values:string[])=>void;disabled:boolean}){
 const category=kind==='categories',max=category?12:30,title=category?'Категории':'Размеры',singular=category?'категорию':'размер';
 const noSize='Без размера';
 const choose=(value:string)=>onChange(!category&&value===noSize?[noSize]:[...selected.filter(x=>category||x!==noSize),value]);
 return <section className="pe-choice" aria-label={title}><div className="pe-field-heading"><span>{title}</span><small>{selected.length} выбрано</small></div><div className="pe-choice-tags">{selected.length?selected.map((name,i)=><span key={name}>{category&&i===0&&<span className="pe-primary-dot" title="Основная категория"/>}{name}<button type="button" aria-label={`Убрать ${singular} ${name} из товара`} disabled={disabled} onClick={()=>onChange(selected.filter(x=>x!==name))}><X size={12}/></button></span>):<small>Пока не выбраны</small>}</div>
 <select aria-label={category?'Добавить категорию из списка':'Добавить размер из списка'} value="" disabled={disabled||selected.length>=max} onChange={e=>{if(e.target.value)choose(e.target.value)}}><option value="">{category?'Выбрать категорию…':'Выбрать размер…'}</option>{(category?choices:[{value:noSize,used:0,banners:0},...choices.filter(c=>c.value!==noSize)]).filter(c=>!selected.includes(c.value)).map(c=><option key={c.value} value={c.value}>{c.value}</option>)}</select>
 <small className="pe-choice-hint">Новые {category?'категории':'размеры'} добавляются отдельно в разделе «Категории и размеры».</small>
 {category&&selected.length>1&&<small className="pe-choice-hint">Первая категория — основная</small>}</section>
}
