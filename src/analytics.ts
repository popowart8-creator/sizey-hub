type Kind='session_start'|'screen_view'|'product_view'|'search'|'favorite_add'|'favorite_remove'|'cart_add'|'checkout_start'|'banner_click'|'engagement'|'scroll_depth'|'size_select'|'photo_view'|'photo_zoom'|'filter_open'|'filter_select'|'cart_quantity'|'cart_remove'|'login_success'|'register_success'|'password_change'|'logout'|'support_click'|'install_prompt'|'install_close'|'install_accept';
type Details={screen?:string;productId?:number;results?:number;viewId?:string;activeMs?:number;depth?:number};
type Source={type:string;detail:string};
type Event=Details&{id:string;visitor:string;session:string;kind:Kind;device:string;formFactor:string;mode:string;source:Source};
export function acquisition(referrer:string,href:string):Source{
 try{const url=new URL(href),medium=(url.searchParams.get('utm_medium')||'').toLowerCase(),rawSource=(url.searchParams.get('utm_source')||'').toLowerCase();
 const provider=(text:string)=>/^(google|google\.)/.test(text)?'google':/^(yandex|ya\.)/.test(text)?'yandex':/^(bing|bing\.)/.test(text)?'bing':/duckduckgo/.test(text)?'duckduckgo':/^(vk|vkontakte|vk\.)/.test(text)?'vk':/^(tg|telegram|t\.me)/.test(text)?'telegram':/^instagram/.test(text)?'instagram':/^(fb|facebook|facebook\.)/.test(text)?'facebook':/^tiktok/.test(text)?'tiktok':/^youtube/.test(text)?'youtube':/^pinterest/.test(text)?'pinterest':'other';
 if(['cpc','ppc','paid','paidsearch','paid_search','display','banner','retargeting','cpm','paid_social'].includes(medium)||url.searchParams.has('gclid')||url.searchParams.has('yclid'))return{type:'advertising',detail:url.searchParams.has('gclid')?'google':url.searchParams.has('yclid')?'yandex':provider(rawSource)};
 if(['email','e-mail','newsletter'].includes(medium))return{type:'email',detail:'other'};
 if(['social','social-network','social_media'].includes(medium))return{type:'social',detail:provider(rawSource)};
 if(!referrer)return{type:rawSource||medium?'unknown':'direct',detail:rawSource||medium?'unknown':'direct'};
 const host=new URL(referrer).hostname.toLowerCase().replace(/^www\./,'');
 if(host==='sizey.ru'||host.endsWith('.sizey.ru'))return{type:'internal',detail:'sizey'};
 if(['mail.google.com','outlook.live.com','mail.yandex.ru','mail.yahoo.com'].some(domain=>host===domain||host.endsWith('.'+domain)))return{type:'email',detail:'other'};
 if(/(^|\.)google\.[a-z.]+$/.test(host))return{type:'search',detail:'google'};
 if(/(^|\.)(yandex\.[a-z]+|ya\.ru)$/.test(host))return{type:'search',detail:'yandex'};
 if(/(^|\.)bing\.com$/.test(host))return{type:'search',detail:'bing'};
 if(/(^|\.)duckduckgo\.com$/.test(host))return{type:'search',detail:'duckduckgo'};
 const social=[['vk.com','vk'],['vk.ru','vk'],['t.me','telegram'],['telegram.org','telegram'],['instagram.com','instagram'],['facebook.com','facebook'],['fb.com','facebook'],['tiktok.com','tiktok'],['youtube.com','youtube'],['pinterest.com','pinterest']].find(([domain])=>host===domain||host.endsWith('.'+domain));if(social)return{type:'social',detail:social[1]};
 // Only a registrable domain: never a full URL, path, query, port or subdomain.
 const parts=host.split('.'),count=/\.(co\.uk|com\.au|co\.jp|com\.br|com\.cn)$/.test(host)?3:2,domain=parts.slice(-count).join('.');
 if(!/^(?:[a-z0-9-]+\.)+[a-z]{2,24}$/.test(domain)||domain.length>100)return{type:'unknown',detail:'unknown'};
 return{type:'referral',detail:domain};
 }catch{return{type:'unknown',detail:'unknown'}}
}
let screenContext:Details={},documentSeen=false,source:Source=acquisition(document.referrer||'',typeof location==='undefined'?'https://hub.sizey.ru/':location.href);
export function setScreenContext(screen:string,viewId:string){screenContext={screen,viewId}}
const queue:Event[]=[];let timer:ReturnType<typeof setTimeout>|undefined,visitor='',session='',last=0,sending=false;
const enabled=()=>navigator.doNotTrack!=='1'&&!(navigator as Navigator&{globalPrivacyControl?:boolean}).globalPrivacyControl;
function identities(){const time=Date.now();try{const v=JSON.parse(localStorage.getItem('sizey-analytics-visitor')||'null');if(v?.id&&time-v.created<90*86400000)visitor=v.id;else{visitor=crypto.randomUUID();localStorage.setItem('sizey-analytics-visitor',JSON.stringify({id:visitor,created:time}))}const s=JSON.parse(localStorage.getItem('sizey-analytics-session')||'null');if(s?.id&&time-s.last<1800000){session=s.id;last=s.last}else if(time-last>=1800000||!session){session=crypto.randomUUID();last=0}localStorage.setItem('sizey-analytics-session',JSON.stringify({id:session,last:time}))}catch{visitor||=crypto.randomUUID();if(!session||time-last>=1800000){session=crypto.randomUUID();last=0}}const fresh=!last||time-last>=1800000;last=time;if(fresh&&documentSeen)source={type:'direct',detail:'direct'};documentSeen=true;return fresh}
function environment(){const ua=navigator.userAgent,tablet=/iPad/i.test(ua)||(/Macintosh/.test(ua)&&navigator.maxTouchPoints>1)||(/Android/.test(ua)&&!/Mobile/.test(ua));const device=/iPhone|iPad|iPod/.test(ua)||tablet&&/Macintosh/.test(ua)?'ios':/Android/.test(ua)?'android':/Windows/.test(ua)?'windows':/Macintosh|Mac OS X/.test(ua)?'macos':/Linux/.test(ua)?'linux':'other';return{device,formFactor:tablet?'tablet':/Mobile|iPhone|iPod|Android/.test(ua)?'mobile':'desktop',mode:window.matchMedia('(display-mode: standalone)').matches||(navigator as Navigator&{standalone?:boolean}).standalone?'pwa':'browser'}}
function event(kind:Kind,details:Details={}):Event{return{id:crypto.randomUUID(),visitor,session,kind,...screenContext,...details,...environment(),source}}
async function flush(beacon=false){if(!enabled()){queue.length=0;return}if(!queue.length||sending&&!beacon)return;const batch=queue.splice(0,25),body=JSON.stringify({events:batch});if(beacon&&navigator.sendBeacon?.('/hub-api/events',new Blob([body],{type:'application/json'}))){if(queue.length)void flush(true);return;}if(sending){queue.unshift(...batch);return;}sending=true;try{const r=await fetch('/hub-api/events',{method:'POST',headers:{'Content-Type':'application/json'},body,credentials:'omit',keepalive:true});if(!r.ok&&r.status>=500)queue.unshift(...batch)}catch{queue.unshift(...batch)}finally{sending=false;if(queue.length){queue.splice(100);timer=setTimeout(()=>void flush(),15000)}}}
export function track(kind:Kind,details:Details={}){if(!enabled()||!crypto.randomUUID)return;try{if(identities())queue.push(event('session_start'));queue.push(event(kind,details));if(queue.length>100)queue.splice(0,queue.length-100);clearTimeout(timer);timer=setTimeout(()=>void flush(),800)}catch{/* Analytics must never interrupt shopping. */}}
window.addEventListener('pagehide',()=>{clearTimeout(timer);void flush(true)});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'){clearTimeout(timer);void flush(true)}});
window.addEventListener('online',()=>void flush());

export function flushAnalytics(){clearTimeout(timer);void flush(true)}
