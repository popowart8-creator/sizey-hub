import LoadingSkeleton from './LoadingSkeleton';
import './loading-skeleton.css';
import {useEffect,useState} from 'react';
import {ArrowLeft,BookOpen} from 'lucide-react';
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
 useEffect(()=>{if(!active)return;const previous=document.body.style.overflow;document.body.style.overflow='hidden';return()=>{document.body.style.overflow=previous}},[active]);
 const related=(article:BlogArticle)=>article.productIds.map(id=>products.find(p=>p.id===id)).filter((p):p is Item=>!!p);
 const open=(article:BlogArticle)=>{setActive(article);track('blog_article_open',{articleSlug:article.slug})};
 return <main className="sizey-blog" aria-label="Блог SIZEY">
  {active?<article className="sizey-blog-article" role="dialog" aria-modal="true" aria-label={active.title}>
    <button className="sizey-blog-back" aria-label="Закрыть статью" onClick={()=>setActive(null)}><ArrowLeft size={22}/></button>

    <h2>{active.title}</h2>

    <div className="sizey-blog-prose">{active.sections.map((section,i)=><p key={i}>{section}</p>)}</div>
    {related(active).length>0&&<section className="sizey-blog-products" aria-label="Товары по теме">
      <h3>Подобрать образ в SIZEY</h3>
      <div className="sizey-blog-productgrid">{related(active).map(product=><button className="sizey-blog-product" key={product.id} onClick={()=>{track('blog_product_click',{articleSlug:active.slug,productId:product.id});onProduct(product.id,active.slug)}}>
        <img src={product.img} alt="" loading="lazy"/>
        <span>{product.name}</span><strong>{product.price.toLocaleString('ru-RU')} ₽</strong>
        
      </button>)}</div>
    </section>}


   </article>:
   <section className="sizey-blog-index">
    <h2>Блог SIZEY</h2>

    {loading?<LoadingSkeleton variant="blog"/>:error?<div className="sizey-blog-state" role="alert">{error}<button onClick={()=>location.reload()}>Повторить</button></div>:
    articles.length===0?<div className="sizey-blog-empty"><BookOpen size={34}/><h3>Готовим полезные материалы</h3><p>Здесь появятся только проверенные статьи, которые помогут сделать выбор.</p></div>:
    <div className="sizey-blog-grid">{articles.map(article=><a className="sizey-blog-card" href={'/?blog='+encodeURIComponent(article.slug)} key={article.id} onClick={event=>{if(event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;event.preventDefault();open(article)}}>
      {related(article)[0]&&<img src={related(article)[0].img} alt="" loading="lazy"/>}
      <span className="sizey-blog-card-info"><strong>{article.title}</strong></span>
    </a>)}</div>}
   </section>}
 </main>;
}
