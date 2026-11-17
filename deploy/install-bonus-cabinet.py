"""Install the client-card password control; preserve and roll back the employee frontend."""
from pathlib import Path
import subprocess,json,hashlib,time,os,urllib.request,urllib.error
assert os.getuid()==0
source=Path(__file__).resolve().parent.parent
frontend=Path('/opt/sizey/app/frontend')
page=frontend/'src/app/clients/[id]/page.tsx'
original=page.read_text()
marker='SIZEY_CUSTOMER_ACCESS_V1'
if marker not in original:
    assert hashlib.sha256(page.read_bytes()).hexdigest()=='a15f5c6c7666864e07e143f2f0d8562b57813f54b88b5ab64ce906848b520048','Client page changed; review before patching'
info=json.loads(subprocess.check_output(['docker','inspect','sizey-prod-frontend']))[0]
assert info['State']['Running'],'Employee frontend is not running'
assert not any(m['Destination'] in ['/app','/app/src'] for m in info.get('Mounts',[])),'Live source is mounted; deployment requires review'
labels=info['Config']['Labels'];service=labels['com.docker.compose.service'];project=labels['com.docker.compose.project']
files=labels['com.docker.compose.project.config_files'].split(',')
working=labels.get('com.docker.compose.project.working_dir') or str(Path(files[0]).parent)
assert all(Path(f).is_file() for f in files)
dc=['docker','compose','--project-directory',working,'-p',project]
envfiles=[f.strip() for f in labels.get('com.docker.compose.project.environment_file','').split(',') if f.strip()]
for f in envfiles:
    assert Path(f).is_file(),'Original compose environment file is missing'
    dc+=['--env-file',f]
for f in files:dc+=['-f',f]
backup=Path('/opt/sizey/backups')/('customer-access-'+str(int(time.time())))
backup.mkdir(parents=True,mode=0o700)
log=backup/'deployment.log'
old_image=info['Image'];image_ref=info['Config']['Image'];backup_tag='sizey-bonus-frontend:before-customer-access-'+str(int(time.time()))

def command(args,timeout=900):
    result=subprocess.run(args,cwd=working,capture_output=True,text=True,timeout=timeout)
    with log.open('a') as f:f.write(result.stdout+'\n'+result.stderr+'\n')
    os.chmod(log,0o600)
    if result.returncode:raise RuntimeError('Command failed: '+args[0]+' / '+(args[1] if len(args)>1 else '')+'; see protected on-server deployment log')
    return result.stdout

command(['docker','tag',old_image,backup_tag])
changes={
 page:None,
 frontend/'src/components/customer-access.tsx':source/'integrations/bonus-cabinet/customer-access.tsx',
 frontend/'src/lib/customer-access-api.ts':source/'integrations/bonus-cabinet/customer-access-api.ts',
 frontend/'src/app/api/customer-access/[id]/route.ts':source/'integrations/bonus-cabinet/route.ts',
}
prior={p:p.read_bytes() if p.exists() else None for p in changes}
for p,data in prior.items():
    if data is not None:
        target=backup/'source'/p.relative_to(frontend);target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(data)
print('Employee frontend image and source backup saved on-server')
canary='sizey-bonus-access-check-'+str(int(time.time()));canary_started=False;live_changed=False

def status(url):
    try:
        with urllib.request.urlopen(url,timeout=10) as response:return response.status
    except urllib.error.HTTPError as e:return e.code
    except Exception:return 0
try:
    for p,origin in changes.items():
        assert p.resolve().is_relative_to(frontend.resolve())
        if origin:
            p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(origin.read_bytes())
    if marker not in original:
        import_line="import { RequireAuth } from '@/components/require-auth';"
        assert original.count(import_line)==1
        text=original.replace(import_line,import_line+"\nimport { CustomerAccess } from '@/components/customer-access';")
        needle='\n      {isAdmin && ('
        assert text.count(needle)==2
        text=text.replace(needle,'\n      {/* '+marker+' */}\n      {canOperateSales(user?.role) && <CustomerAccess clientId={client.id} clientName={client.name} phone={client.phone} phoneNormalized={client.phoneNormalized} />}\n'+needle,1)
        page.write_text(text)
    print('Building updated employee frontend; running cabinet remains available')
    command(dc+['build','--build-arg','NEXT_PUBLIC_API_URL=https://api.sizey.ru',service],timeout=900)
    command(['docker','run','-d','--name',canary,'--network','proxy','-e','HOSTNAME=0.0.0.0','-e','PORT=3000',image_ref])
    canary_started=True
    smoke="""import fs from 'node:fs';const base='http://127.0.0.1:3000';const r=await fetch(base+'/');if(r.status!==200)throw Error('Frontend unavailable');const id='00000000-0000-4000-8000-000000000000';const guarded=await fetch(base+'/api/customer-access/'+id);if(guarded.status!==401)throw Error('Staff route not protected');if(!guarded.headers.get('cache-control')?.includes('no-store'))throw Error('Private response cache policy missing');const wrongOrigin=await fetch(base+'/api/customer-access/'+id,{method:'POST',headers:{Authorization:'Bearer invalid',Origin:'https://evil.invalid','Content-Type':'application/json'},body:JSON.stringify({identityChecked:true,expectedPhone:'+79990000000'})});if(wrongOrigin.status!==403)throw Error('Origin check failed');const invalidToken=await fetch(base+'/api/customer-access/'+id,{headers:{Authorization:'Bearer invalid'}});if(invalidToken.status!==401)throw Error('Employee token not checked');const dir='/app/.next/static';const files=fs.readdirSync(dir,{recursive:true}).filter(f=>f.endsWith('.js'));if(!files.some(f=>fs.readFileSync(dir+'/'+f,'utf8').includes('/api/customer-access/')))throw Error('Client UI missing');if(!files.some(f=>fs.readFileSync(dir+'/'+f,'utf8').includes('https://api.sizey.ru')))throw Error('Employee API origin missing');console.log(JSON.stringify({employeeFrontendReady:true,staffRouteProtected:true,privateCachingDisabled:true,originProtected:true,employeeJwtVerified:true,clientControlBuilt:true}));"""
    for attempt in range(30):
        try:
            result=command(['docker','exec',canary,'node','--input-type=module','-e',smoke],timeout=45)
            print('Canary verification:',result.strip());break
        except RuntimeError:
            if attempt==29:raise
            time.sleep(1)
    print('Canary checks passed; updating only the employee frontend container')
    live_changed=True
    command(dc+['up','-d','--no-deps','--no-build','--pull','never',service],timeout=120)
    for attempt in range(30):
        if status('https://app.sizey.ru/')==200 and status('https://app.sizey.ru/api/customer-access/00000000-0000-4000-8000-000000000000')==401:break
        if attempt==29:raise RuntimeError('Published employee frontend health check failed')
        time.sleep(1)
    print('Employee cabinet integration published; original bonus backend and database were not restarted')
except Exception:
    for p,data in prior.items():
        if data is None:p.unlink(missing_ok=True)
        else:p.write_bytes(data)
    command(['docker','tag',backup_tag,image_ref])
    if live_changed:command(dc+['up','-d','--no-deps','--no-build','--pull','never',service],timeout=120)
    print('Employee frontend source and previous image restored')
    raise
finally:
    if canary_started:subprocess.run(['docker','rm','-f',canary],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
