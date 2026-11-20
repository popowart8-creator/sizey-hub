import {useEffect,useState,type FormEvent} from 'react';
import {Check,ChevronRight,RefreshCw,Sparkles,X,Plus,Trash2} from 'lucide-react';
import './blog-panel.css';

type Article={id:string;slug:string;title:string;summary:string;sections:string[];sources:{title:string;url:string}[];productIds:number[];score:number;published:boolean;updated:number};
type Request=<T>(path:string,data?:unknown,signal?:AbortSignal)=>Promise<T>;
const sourceLines=(article:Article)=>article.sources.map(s=>s.title+' | '+s.url).join('\n');
export default function BlogPanel({request}:{request:Request}){
 const[tab,setTab]=useState<'drafts'|'published'>('drafts'),[drawer,setDrawer]=useState<'create'|'detail'|null>(null); 
 const[articles,setArticles]=useState<Article[]>([]),[selected,setSelected]=useState<Article|null>(null),[topic,setTopic]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const[ideas,setIdeas]=useState<{topic:string;score:number;sourceCount:number}[]>([]),[finding,setFinding]=useState(false);
 const[title,setTitle]=useState(''),[slug,setSlug]=useState(''),[summary,setSummary]=useState(''),[sections,setSections]=useState(''),[sources,setSources]=useState(''),[productIds,setProductIds]=useState('');
 const open=(item:Article)=>{setDrawer('detail');setSelected(item);setTitle(item.title);setSlug(item.slug);setSummary(item.summary);setSections(item.sections.join('\n\n'));setSources(sourceLines(item));setProductIds(item.productIds.join(', '));setError('');setNotice('')};
 async function load(){setLoading(true);try{const x=await request<{articles:Article[]}>('/blog');setArticles(x.articles)}catch(e){setError((e as Error).message)}finally{setLoading(false)}}
 useEffect(()=>{void load()},[]);
 async function findIdeas(){setFinding(true);setError('');setNotice('');try{const result=await request<{ideas:{topic:string;score:number;sourceCount:number}[]}>('/blog/ideas');setIdeas(result.ideas);if(result.ideas.length===0)setNotice('Пока нет тем, прошедших порог 85/100 с подтверждёнными источниками.')}catch(e){setError((e as Error).message)}finally{setFinding(false)}}
 async function generate(e:FormEvent){e.preventDefault();await generateTopic(topic)}
 async function generateTopic(nextTopic:string){setTopic(nextTopic);setBusy(true);setError('');setNotice('');try{
  const started=await request<{jobId:string;state:string}>('/blog/generate',{topic:nextTopic});
  if(!started.jobId)throw Error('Сервер не вернул номер задачи');
  setNotice('Qwen готовит черновик. Это может занять до двух минут. Не закрывайте вкладку.');
  let result:{state:string;result?:{rejected:boolean;score:number;reason?:string;article?:Article};message?:string}|undefined;
  for(let attempt=0;attempt<100;attempt++){
   await new Promise(resolve=>setTimeout(resolve,2000));
   result=await request<typeof result>('/blog/generate/status?id='+encodeURIComponent(started.jobId));
   if(result?.state!=='running')break;
  }
  if(!result||result.state==='running')throw Error('Генерация занимает слишком много времени. Обновите список статей позднее.');
  if(result.state==='failed')throw Error(result.message||'Ошибка генерации Qwen');
  const x=result.result;
  if(!x)throw Error('Сервер не вернул результат генерации');
  if(x.rejected){setNotice('Тема отклонена ('+x.score+'/100): '+x.reason);return}
  if(x.article){setTab('drafts');open(x.article);setNotice('Qwen создал черновик. Проверьте все утверждения и источники до публикации.');await load()}
 }catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 async function remove(item:Article){if(item.published)return;if(!window.confirm('Удалить черновик «'+item.title+'» без возможности восстановления?'))return;setBusy(true);setError('');try{await request('/blog/delete',{id:item.id});if(selected?.id===item.id){setSelected(null);setDrawer(null)}setNotice('Черновик удалён');await load()}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 async function save(e:FormEvent){e.preventDefault();if(!selected)return;setBusy(true);setError('');setNotice('');try{
  const parsed=sources.split(/\r?\n/).map(s=>s.trim()).filter(Boolean).map(s=>{const i=s.lastIndexOf(' | ');return{title:i>=0?s.slice(0,i):'',url:i>=0?s.slice(i+3):''}});
  const article={...selected,title,slug,summary,sections:sections.split(/\n\s*\n/).map(s=>s.trim()).filter(Boolean),sources:parsed,productIds:productIds.split(/[,;\s]+/).filter(Boolean).map(Number)};
  const response=await request<{article:Article}>('/blog/save',{id:selected.id,article});open(response.article);setNotice('Черновик сохранён');await load();
 }catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 async function publish(item:Article,published:boolean){setBusy(true);setError('');setNotice('');try{const r=await request<{article:Article}>('/blog/publish',{id:item.id,published});if(selected?.id===item.id)open(r.article);setTab(published?'published':'drafts');setNotice(published?'Статья опубликована':'Статья скрыта');await load()}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 const visible=articles.filter(item=>item.published===(tab==='published'));
 return <div className="blog-admin">
  <section className="panel blog-admin-intro"><div><span className="blog-admin-kicker"><Sparkles size={17}/> SIZEY / AI JOURNAL</span><h2>Статьи блога</h2><p>Управляйте черновиками и опубликованными материалами. Публикация только после проверки редактором.</p></div><button className="primary" type="button" onClick={()=>{setSelected(null);setDrawer('create');setError('');setNotice('')}}><Plus size={18}/> Создать статью</button></section>
  {error&&<p className="notice error" role="alert">{error}</p>}{notice&&<p className="blog-admin-notice" role="status">{notice}</p>}
  <section className="panel blog-admin-list"><div className="blog-admin-toolbar"><div className="blog-admin-tabs"><button type="button" className={tab==='drafts'?'active':''} onClick={()=>setTab('drafts')}>Черновики ({articles.filter(a=>!a.published).length})</button><button type="button" className={tab==='published'?'active':''} onClick={()=>setTab('published')}>Опубликованные ({articles.filter(a=>a.published).length})</button></div><button className="secondary" type="button" onClick={()=>void load()} disabled={loading}><RefreshCw size={16}/> Обновить</button></div>
  <div className="blog-admin-table-wrap"><table className="blog-admin-table"><thead><tr><th>Название</th><th>Оценка</th><th>Изменено</th><th>Статус</th><th>Действия</th></tr></thead><tbody>{visible.map(item=><tr key={item.id}><td><button className="blog-admin-title-link" type="button" onClick={()=>open(item)}>{item.title}</button><small>/{item.slug}</small></td><td>{item.score}/100</td><td>{new Date(item.updated).toLocaleDateString('ru-RU')}</td><td><span className={'blog-admin-status '+(item.published?'live':'draft')}>{item.published?'Опубликовано':'Черновик'}</span></td><td><div className="blog-admin-actions"><button type="button" title="Открыть статью" aria-label={'Открыть '+item.title} onClick={()=>open(item)}><ChevronRight size={18}/></button>{!item.published&&<button type="button" title="Удалить черновик" aria-label={'Удалить '+item.title} disabled={busy} onClick={()=>void remove(item)}><Trash2 size={17}/></button>}</div></td></tr>)}</tbody></table>{!loading&&visible.length===0&&<p className="blog-admin-empty">{tab==='drafts'?'Черновиков пока нет. Нажмите «Создать статью».':'Опубликованных статей пока нет.'}</p>}{loading&&<p className="blog-admin-empty">Загружаем статьи…</p>}</div></section>
  {drawer&&<div className="blog-admin-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setDrawer(null)}}><aside className="blog-admin-drawer" role="dialog" aria-modal="true" aria-label={drawer==='create'?'Создать статью':'Просмотр статьи'}><div className="blog-admin-drawer-head"><h3>{drawer==='create'?'Создать статью':'Детальный просмотр'}</h3><button type="button" aria-label="Закрыть" onClick={()=>setDrawer(null)}><X size={20}/></button></div><div className="blog-admin-drawer-body">
  {drawer==='create'?<><p className="blog-admin-note">Qwen исследует источники и подготовит неопубликованный черновик для проверки.</p><form onSubmit={generate}><label htmlFor="blog-topic">Тема статьи<input id="blog-topic" required minLength={12} maxLength={140} value={topic} onChange={e=>setTopic(e.target.value)} placeholder="Как выбрать платье на осень и с чем его носить"/></label><button className="primary" disabled={busy}><Sparkles size={17}/>{busy?'Создаём черновик…':'Исследовать и создать'}</button></form><button className="secondary" type="button" onClick={()=>void findIdeas()} disabled={finding||busy}>{finding?'Ищем темы…':'Подобрать темы автоматически'}</button>{ideas.length>0&&<div className="blog-admin-ideas">{ideas.map(idea=><button key={idea.topic} type="button" onClick={()=>void generateTopic(idea.topic)} disabled={busy||finding}><span>{idea.topic}<small>{idea.score}/100 · {idea.sourceCount} источников</small></span><ChevronRight size={17}/></button>)}</div>}</>:selected&&<><p className="blog-admin-note">{selected.published?'Статья опубликована. Снимите её с публикации для редактирования.':'Проверьте текст и источники перед публикацией.'}</p>
    <form onSubmit={save}>
    <label>Заголовок<input value={title} onChange={e=>setTitle(e.target.value)} required minLength={12} maxLength={140} disabled={selected.published}/></label>
    <label>Адрес статьи<input value={slug} onChange={e=>setSlug(e.target.value)} required maxLength={100} disabled={selected.published}/></label>
    <label>Краткое описание<textarea rows={3} value={summary} onChange={e=>setSummary(e.target.value)} required disabled={selected.published}/></label>
    <label>Абзацы — разделяйте пустой строкой<textarea rows={12} value={sections} onChange={e=>setSections(e.target.value)} required disabled={selected.published}/></label>
    <label>Источники — «название | https://адрес», каждый с новой строки<textarea rows={5} value={sources} onChange={e=>setSources(e.target.value)} required disabled={selected.published}/></label>
    <label>ID связанных товаров через запятую<input value={productIds} onChange={e=>setProductIds(e.target.value)} required disabled={selected.published}/></label>
    {!selected.published&&<button className="primary" disabled={busy}><Check size={17}/> Сохранить черновик</button>}
   </form>

 <div className="blog-admin-publish"><span>Оценка {selected.score}/100</span><button className={selected.published?'secondary':'primary'} type="button" onClick={()=>void publish(selected,!selected.published)} disabled={busy||(!selected.published&&selected.score<85)}>{selected.published?'Снять с публикации':'Опубликовать'}</button></div>{!selected.published&&<button className="blog-admin-delete" type="button" disabled={busy} onClick={()=>void remove(selected)}><Trash2 size={16}/> Удалить черновик</button>}</>}
  </div></aside></div>}
 </div>
}
