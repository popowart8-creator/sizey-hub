export function staffBackend(base='http://sizey-prod-backend:4000'){
 const request=async(path,options)=>{const r=await fetch(base+path,{...options,signal:AbortSignal.timeout(10000)});if(!r.ok){const error=new Error('Employee authentication failed');error.status=r.status;throw error;}return r.json()};
 return{
  login:(login,password)=>request('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({loginOrPhone:login,password})}),
  me:accessToken=>request('/api/auth/me',{headers:{Authorization:'Bearer '+accessToken}})
 };
}
