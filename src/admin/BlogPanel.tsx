import {useEffect,useState,type FormEvent} from 'react';
import {BookOpen,Check,ChevronRight,RefreshCw,Sparkles,X} from 'lucide-react';
import './blog-panel.css';

type Article={id:string;slug:string;title:string;summary:string;sections:string[];sources:{title:string;url:string}[];productIds:number[];score:number;published:boolean;updated:number};
type Request=<T>(path:string,data?:unknown,signal?:AbortSignal)=>Promise<T>;
const sourceLines=(article:Article)=>article.sources.map(s=>s.title+' | '+s.url).join('\n');
export default function BlogPanel({request}:{request:Request}){
 const[articles,setArticles]=useState<Article[]>([]),[selected,setSelected]=useState<Article|null>(null),[topic,setTopic]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const[title,setTitle]=useState(''),[slug,setSlug]=useState(''),[summary,setSummary]=useState(''),[sections,setSections]=useState(''),[sources,setSources]=useState(''),[productIds,setProductIds]=useState('');
 const open=(item:Article)=>{setSelected(item);setTitle(item.title);setSlug(item.slug);setSummary(item.summary);setSections(item.sections.join('\n\n'));setSources(sourceLines(item));setProductIds(item.productIds.join(', '));setError('');setNotice('')};
 async function load(){setLoading(true);try{const x=await request<{articles:Article[]}>('/blog');setArticles(x.articles)}catch(e){setError((e as Error).message)}finally{setLoading(false)}}
 useEffect(()=>{void load()},[]);
 async function generate(e:FormEvent){e.preventDefault();setBusy(true);setError('');setNotice('');try{
  const x=await request<{rejected:boolean;score:number;reason?:string;article?:Article}>('/blog/generate',{topic});
  if(x.rejected){setNotice('Тема отклонена ('+x.score+'/100): '+x.reason);return}
  if(x.article){open(x.article);setNotice('Qwen создал черновик. Проверьте все утверждения и источники до публикации.');await load()}
 }catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 async function save(e:FormEvent){e.preventDefault();if(!selected)return;setBusy(true);setError('');setNotice('');try{
  const parsed=sources.split(/\r?\n/).map(s=>s.trim()).filter(Boolean).map(s=>{const i=s.lastIndexOf(' | ');return{title:i>=0?s.slice(0,i):'',url:i>=0?s.slice(i+3):''}});
  const article={...selected,title,slug,summary,sections:sections.split(/\n\s*\n/).map(s=>s.trim()).filter(Boolean),sources:parsed,productIds:productIds.split(/[,;\s]+/).filter(Boolean).map(Number)};
  const response=await request<{article:Article}>('/blog/save',{id:selected.id,article});open(response.article);setNotice('Черновик сохранён');await load();
 }catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 async function publish(item:Article,published:boolean){setBusy(true);setError('');setNotice('');try{const r=await request<{article:Article}>('/blog/publish',{id:item.id,published});if(selected?.id===item.id)open(r.article);setNotice(published?'Статья опубликована':'Статья скрыта');await load()}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 return <div className="blog-admin">
  <section className="panel blog-admin-intro"><div><span className="blog-admin-kicker"><Sparkles size={17}/> SIZEY / AI JOURNAL</span><h2>Конверсионный блог</h2><p>Qwen исследует открытые источники, отбирает коммерчески релевантные темы и создаёт черновики. Ни одна статья не публикуется без проверки и решения администратора.</p></div><div className="blog-admin-threshold"><strong>85/100</strong><small>Минимальный допуск к публикации</small></div></section>
  <section className="panel blog-admin-research"><h3>Исследовать тему с Qwen</h3><form onSubmit={generate}><label htmlFor="blog-topic">Тема с покупательским намерением</label><div className="blog-admin-generate"><input id="blog-topic" required minLength={12} maxLength={140} value={topic} onChange={e=>setTopic(e.target.value)} placeholder="Как выбрать платье на осень и с чем его носить"/><button className="primary" disabled={busy}><Sparkles size={17}/>{busy?'Проверяем…':'Исследовать и создать'}</button></div></form><p className="blog-admin-note">Если нет независимых интернет-источников, подходящих товаров или нужного рейтинга, Qwen не создаёт статью.</p></section>
  {error&&<p className="notice error" role="alert">{error}</p>}{notice&&<p className="blog-admin-notice" role="status">{notice}</p>}
  <div className="blog-admin-columns"><section className="panel blog-admin-list"><div className="blog-admin-heading"><h3>Статьи</h3><button onClick={()=>void load()} aria-label="Обновить статьи" disabled={loading}><RefreshCw size={17}/></button></div>
   {loading&&!articles.length?<p>Загружаем…</p>:articles.length===0?<p className="blog-admin-note">Статей пока нет. Начните с исследования коммерческой темы.</p>:
   articles.map(item=><button className={'blog-admin-row '+(selected?.id===item.id?'active':'')} key={item.id} onClick={()=>open(item)}><span><strong>{item.title}</strong><small>{item.published?'Опубликовано':'Черновик'} · {item.score}/100</small></span><ChevronRight size={17}/></button>)}
  </section>
  {selected&&<section className="panel blog-admin-editor"><div className="blog-admin-heading"><h3>Редактор материала</h3><button onClick={()=>setSelected(null)} aria-label="Закрыть редактор"><X size={19}/></button></div><p className="blog-admin-note">Источники подтверждают факты. Проверьте их вручную, особенно актуальность цен и утверждения Qwen.</p>
   <form onSubmit={save}>
    <label>Заголовок<input value={title} onChange={e=>setTitle(e.target.value)} required minLength={12} maxLength={140} disabled={selected.published}/></label>
    <label>Адрес статьи<input value={slug} onChange={e=>setSlug(e.target.value)} required maxLength={100} disabled={selected.published}/></label>
    <label>Краткое описание<textarea rows={3} value={summary} onChange={e=>setSummary(e.target.value)} required disabled={selected.published}/></label>
    <label>Абзацы — разделяйте пустой строкой<textarea rows={12} value={sections} onChange={e=>setSections(e.target.value)} required disabled={selected.published}/></label>
    <label>Источники — «название | https://адрес», каждый с новой строки<textarea rows={5} value={sources} onChange={e=>setSources(e.target.value)} required disabled={selected.published}/></label>
    <label>ID связанных товаров через запятую<input value={productIds} onChange={e=>setProductIds(e.target.value)} required disabled={selected.published}/></label>
    {!selected.published&&<button className="primary" disabled={busy}><Check size={17}/> Сохранить черновик</button>}
   </form><div className="blog-admin-publish"><span>Оценка {selected.score}/100</span><button className={selected.published?'secondary':'primary'} onClick={()=>void publish(selected,!selected.published)} disabled={busy||(!selected.published&&selected.score<85)}>{selected.published?'Снять с публикации':'Опубликовать'}</button></div>
  </section>}</div>
 </div>
}
