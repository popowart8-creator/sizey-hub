import {createHash} from 'node:crypto';
const DAY=86400000;
export const autoSlug=topic=>'sizey-'+createHash('sha256').update(topic).digest('hex').slice(0,18);
export async function createDailyBlogDraft({blog,blogAI,store,now=Date.now}){
 const existing=blog.list(),products=store.list('products');
 if(existing.some(item=>item.created>now()-DAY))return{created:false,reason:'daily-limit'};
 const ideas=await blogAI.discover(products);
 for(const idea of ideas){
  if(idea.score<85)continue;
  const slug=autoSlug(idea.topic);
  if(existing.some(item=>item.slug===slug))continue;
  const result=await blogAI.generate({topic:idea.topic,products});
  if(result.rejected||!result.article||result.article.score<85)continue;
  const article=blog.save({...result.article,slug});
  return{created:true,article};
 }
 return{created:false,reason:'no-qualified-topic'};
}
export function scheduleDailyBlogDrafts({blog,blogAI,store,enabled=process.env.BLOG_AUTO_DRAFTS!=='0',intervalMs=DAY}){
 if(!enabled)return()=>{};
 let running=false;
 const run=async()=>{if(running)return;running=true;try{await createDailyBlogDraft({blog,blogAI,store})}catch(error){console.error('Blog auto-draft skipped:',error?.message||'unavailable')}finally{running=false}};
 const initial=setTimeout(()=>void run(),300000);
 const interval=setInterval(()=>void run(),intervalMs);
 initial.unref?.();interval.unref?.();
 return()=>{clearTimeout(initial);clearInterval(interval)};
}
