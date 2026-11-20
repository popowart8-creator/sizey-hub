import {useEffect,useState} from 'react';
import {ArrowLeft,ArrowRight,BookOpen,ChevronRight,ShoppingBag} from 'lucide-react';
import {track} from './analytics';
import useLayerBack from './useLayerBack';
import './blog.css';

export type BlogArticle={
 id:string;slug:string;title:string;summary:string;sections:string[];
 sources:{title:string;url:string}[];productIds:number[];publishedAt:number|null;score:number
};
type Item={id:number;name:string;price:number;img:string};
export default function BlogScreen({products,initialSlug,onExplore,onProduct,onArticleChange}:{
 products:Item[];initialSlug?:string;onExplore:(slug?:string)=>void;onProduct:(id:number,slug:string)=>void;onArticleChange:(slug:string)=>void
}){
 const[articles,setArticles]=useState<BlogArticle[]>([]);
 const[active,setActive]=useState<BlogArticle|null>(null);
 const[loading,setLoading]=useState(true),[error,setError]=useState('');
 useEffect(()=>{let alive=true;fetch('/hub-api/blog',{cache:'no-store',credentials:'omit'}).then(async response=>{if(!response.ok)throw Error('Блог временно недоступен');const data=await response.json();if(!Array.isArray(data.articles))throw Error('Неверные данные блога');return data.articles as BlogArticle[]}).then(items=>{if(alive){setArticles(items);const direct=initialSlug&&items.find(x=>x.slug===initialSlug);if(direct){setActive(direct);track('blog_article_open',{articleSlug:direct.slug})}}}).catch(()=>{if(alive)setError('Не удалось загрузить статьи')}).finally(()=>{if(alive)setLoading(false)});return()=>{alive=false}},[]);
 useEffect(()=>onArticleChange(active?.slug||''),[active?.slug,onArticleChange]);
 useEffect(()=>{if(!active)return;const oldTitle=document.title,meta=document.querySelector<HTMLMetaElement>('meta[name="description"]'),oldDescription=meta?.content;document.title=active.title+' — SIZEY';if(meta)meta.content=active.summary;return()=>{document.title=oldTitle;if(meta&&oldDescription!==undefined)meta.content=oldDescription}},[active?.slug]);
 useLayerBack(!!active,'blog-article',()=>setActive(null));
 const related=(article:BlogArticle)=>article.productIds.map(id=>products.find(p=>p.id===id)).filter((p):p is Item=>!!p);
 const open=(article:BlogArticle)=>{setActive(article);track('blog_article_open',{articleSlug:article.slug})};
 return <main className="sizey-blog" aria-label="Блог и новости SIZEY">
  {active?<article className="sizey-blog-article">
    <button className="sizey-blog-back" onClick={()=>setActive(null)}><ArrowLeft size={20}/> Все статьи</button>
    <p className="sizey-blog-eyebrow">SIZEY / ГИД ПО СТИЛЮ</p>
    <h2>{active.title}</h2>
    <p className="sizey-blog-lead">{active.summary}</p>
    <div className="sizey-blog-prose">{active.sections.map((section,i)=><p key={i}>{section}</p>)}</div>
    {related(active).length>0&&<section className="sizey-blog-products" aria-label="Товары по теме">
      <h3>Подобрать образ в SIZEY</h3>
      <div className="sizey-blog-productgrid">{related(active).map(product=><button className="sizey-blog-product" key={product.id} onClick={()=>{track('blog_product_click',{articleSlug:active.slug,productId:product.id});onProduct(product.id,active.slug)}}>
        <img src={product.img} alt="" loading="lazy"/>
        <span>{product.name}</span><strong>{product.price.toLocaleString('ru-RU')} ₽</strong>
        <span className="sizey-blog-product-action">Посмотреть <ArrowRight size={15}/></span>
      </button>)}</div>
    </section>}
    <button className="blackbtn sizey-blog-cta" onClick={()=>{track('blog_collection_click',{articleSlug:active.slug});onExplore(active.slug)}}><ShoppingBag size={19}/> Смотреть всю коллекцию <ArrowRight size={19}/></button>
    <section className="sizey-blog-sources"><h3>Источники и материалы</h3>
      <p>Информационные материалы для самостоятельного ознакомления. Наличие товаров и цены проверяйте в каталоге.</p>
      {active.sources.map(source=><a key={source.url} href={source.url} target="_blank" rel="noopener noreferrer">{source.title} <ArrowRight size={14}/></a>)}
    </section>
   </article>:
   <section className="sizey-blog-index">
    <p className="sizey-blog-eyebrow">SIZEY JOURNAL</p><h2>Стиль, который подходит вам</h2>
    <p className="sizey-blog-lead">Практичные материалы о выборе одежды, сочетаниях и деталях образа — с вещами из коллекции SIZEY.</p>
    {loading?<p className="sizey-blog-state" role="status">Загружаем материалы…</p>:error?<div className="sizey-blog-state" role="alert">{error}<button onClick={()=>location.reload()}>Повторить</button></div>:
    articles.length===0?<div className="sizey-blog-empty"><BookOpen size={34}/><h3>Готовим полезные материалы</h3><p>Здесь появятся только проверенные статьи, которые помогут сделать выбор.</p><button onClick={()=>onExplore()} className="blackbtn">Смотреть коллекцию <ArrowRight size={18}/></button></div>:
    <div className="sizey-blog-grid">{articles.map(article=><a className="sizey-blog-card" href={'/?blog='+encodeURIComponent(article.slug)} key={article.id} onClick={event=>{if(event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;event.preventDefault();open(article)}}>
      {related(article)[0]&&<img src={related(article)[0].img} alt="" loading="lazy"/>}
      <span className="sizey-blog-card-info"><span className="sizey-blog-eyebrow">ГИД SIZEY</span><strong>{article.title}</strong><span>{article.summary}</span><span className="sizey-blog-more">Читать статью <ChevronRight size={17}/></span></span>
    </a>)}</div>}
   </section>}
 </main>;
}
