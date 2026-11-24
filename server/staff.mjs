export function staffBackend(base='http://sizey-prod-backend:4000'){
 const request=async(path,options)=>{const r=await fetch(base+path,{...options,signal:AbortSignal.timeout(10000)});if(!r.ok){const error=new Error('Employee authentication failed');error.status=r.status;throw error;}const data=await r.json();const cookies=r.headers.getSetCookie?.()||[];const refreshCookie=cookies.map(c=>c.split(';')[0]).filter(c=>/refresh/i.test(c.split('=')[0])).join('; ');return {...data,...(refreshCookie?{refreshCookie}:{})}};
 return{
  login:(login,password)=>request('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({loginOrPhone:login,password})}),
  refresh:refreshCookie=>request('/api/auth/refresh',{method:'POST',headers:{Cookie:refreshCookie,'Content-Type':'application/json'},body:'{}'}),
  me:accessToken=>request('/api/auth/me',{headers:{Authorization:'Bearer '+accessToken}})
 };
}
