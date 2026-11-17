"""Publish the complete employee client directory with targeted rollback."""
from pathlib import Path
import subprocess, json, hashlib, time, os, urllib.request, urllib.error
assert os.getuid() == 0
source = Path(__file__).resolve().parent.parent
base = Path('/opt/sizey/app')
page = base/'frontend/src/app/page.tsx'
controller = base/'backend/src/clients/clients.controller.ts'
service = base/'backend/src/clients/clients.service.ts'
prior = {p: p.read_bytes() for p in [page, controller, service]}
marker = 'SIZEY_ALL_CLIENTS_V1'
if marker not in controller.read_text():
    assert hashlib.sha256(page.read_bytes()).hexdigest() == '5d369c9c4ce5e2ffe8b31375e5cc82df9d26da8d0d864187c286c350ed679dc9', 'Homepage changed; review required'
    old = "  recent(@Query('limit') limit?: string) {\n    return this.clients.recent(Number(limit) || 10);\n  }"
    assert controller.read_text().count(old) == 1, 'Controller changed; review required'
    assert service.read_text().count('async recent(limit = 10) {') == 1
    assert service.read_text().count('take: Math.min(limit, 50),') == 1
infos = {name: json.loads(subprocess.check_output(['docker', 'inspect', 'sizey-prod-'+name]))[0] for name in ['frontend', 'backend']}
info = infos['frontend']; labels = info['Config']['Labels']
working = labels['com.docker.compose.project.working_dir']
dc = ['docker', 'compose', '--project-directory', working, '-p', labels['com.docker.compose.project']]
for f in filter(None, labels.get('com.docker.compose.project.environment_file', '').split(',')):
    assert Path(f).is_file(); dc += ['--env-file', f]
for f in labels['com.docker.compose.project.config_files'].split(','):
    assert Path(f).is_file(); dc += ['-f', f]
services = [infos[n]['Config']['Labels']['com.docker.compose.service'] for n in ['backend', 'frontend']]
for item in infos.values():
    assert item['State']['Running']
    assert item['Config']['Labels']['com.docker.compose.project'] == labels['com.docker.compose.project']
    assert not any(m['Destination'] in ['/app', '/app/src'] for m in item.get('Mounts', []))
backup = Path('/opt/sizey/backups')/('all-clients-'+str(int(time.time())))
backup.mkdir(parents=True, mode=0o700)
log = backup/'deployment.log'

def command(args, timeout=900):
    result = subprocess.run(args, cwd=working, capture_output=True, text=True, timeout=timeout)
    with log.open('a') as f: f.write(result.stdout+'\n'+result.stderr+'\n')
    os.chmod(log, 0o600)
    if result.returncode: raise RuntimeError('Deployment command failed; see protected on-server log')
    return result.stdout

for p, data in prior.items():
    target = backup/'source'/p.relative_to(base)
    target.parent.mkdir(parents=True, exist_ok=True); target.write_bytes(data)
for name, item in infos.items():
    command(['docker', 'tag', item['Image'], 'sizey-'+name+':before-all-clients-'+backup.name])
changed = False; canary = 'sizey-clients-check-'+str(int(time.time())); canary_started = False

def status(url):
    try:
        with urllib.request.urlopen(url, timeout=10) as r: return r.status
    except urllib.error.HTTPError as e: return e.code
    except Exception: return 0

try:
    if marker not in controller.read_text():
        controller.write_text(controller.read_text().replace(old, "  // "+marker+"\n  recent(@Query('limit') limit?: string, @Query('all') all?: string) {\n    return this.clients.recent(Number(limit) || 10, all === 'true');\n  }"))
        service.write_text(service.read_text().replace('async recent(limit = 10) {', 'async recent(limit = 10, all = false) {').replace('take: Math.min(limit, 50),', '...(all ? {} : { take: Math.min(limit, 50) }),', 1))
    page.write_bytes((source/'integrations/bonus-cabinet/home-page.tsx').read_bytes())
    print('Building backend and frontend while existing containers remain available', flush=True)
    command(dc+['build', '--build-arg', 'NEXT_PUBLIC_API_URL=https://api.sizey.ru']+services, timeout=1200)
    # Test the real backend service with Prisma and bonus ledger mocked; no DB writes.
    backend_image = infos['backend']['Config']['Image']
    logic = """const fs=require('fs');const file=fs.readdirSync('/app/dist',{recursive:true}).find(f=>f.endsWith('clients/clients.service.js'));if(!file)throw Error('Service build missing');const {ClientsService}=require('/app/dist/'+file); let captured; const rows=Array.from({length:63},(_,i)=>({id:String(i)}));const fake={client:{findMany:async opts=>{captured=opts;return opts.take?rows.slice(0,opts.take):rows;}}};const instance=Object.create(ClientsService.prototype);instance.prisma=fake;instance.activeWhere=()=>({deletedAt:null});instance.serialize=x=>x;instance.withAvailableBalance=async x=>x;(async()=>{let all=await instance.recent(8,true);if(all.length!==63||'take' in captured||captured.where.deletedAt!==null)throw Error('All-client query truncated');let recent=await instance.recent(8);if(recent.length!==8)throw Error('Legacy limit changed');console.log('All 63 fixtures returned; legacy limit and active-client filter preserved');})().catch(()=>process.exit(1));"""
    command(['docker','run','--rm','--entrypoint','node',backend_image,'-e',logic],timeout=45)
    frontend_image = infos['frontend']['Config']['Image']
    command(['docker','run','-d','--name',canary,'--network','proxy','-e','HOSTNAME=0.0.0.0','-e','PORT=3000',frontend_image]); canary_started=True
    smoke = """const fs=require('fs');(async()=>{const r=await fetch('http://127.0.0.1:3000');if(r.status!==200)throw Error('Frontend unavailable');const dir='/app/.next/static';const files=fs.readdirSync(dir,{recursive:true}).filter(f=>f.endsWith('.js'));const chunks=files.map(f=>fs.readFileSync(dir+'/'+f,'utf8'));if(!chunks.some(s=>s.includes('/api/clients?all=true')&&s.includes('Все клиенты')))throw Error('Complete list UI missing');const p=await fetch('http://127.0.0.1:3000/api/customer-access/00000000-0000-4000-8000-000000000000');if(p.status!==401)throw Error('Password route protection changed');console.log('All-client UI and existing password route verified');})().catch(()=>process.exit(1));"""
    for attempt in range(30):
        try:
            command(['docker','exec',canary,'node','-e',smoke],timeout=30); break
        except RuntimeError:
            if attempt == 29: raise
            time.sleep(1)
    print('Build and isolated checks passed', flush=True)
    changed=True
    command(dc+['up','-d','--no-deps','--no-build','--pull','never',services[0]],timeout=120)
    for attempt in range(30):
        if status('https://api.sizey.ru/api/health')==200 and status('https://api.sizey.ru/api/clients?all=true')==401: break
        if attempt==29: raise RuntimeError('Backend health or auth check failed')
        time.sleep(1)
    command(dc+['up','-d','--no-deps','--no-build','--pull','never',services[1]],timeout=120)
    for attempt in range(30):
        if status('https://app.sizey.ru/')==200 and status('https://app.sizey.ru/api/customer-access/00000000-0000-4000-8000-000000000000')==401: break
        if attempt==29: raise RuntimeError('Frontend health check failed')
        time.sleep(1)
    print('Complete client directory published; database and customer passwords unchanged', flush=True)
except Exception:
    for p,data in prior.items(): p.write_bytes(data)
    for name,item in infos.items(): command(['docker','tag','sizey-'+name+':before-all-clients-'+backup.name,item['Config']['Image']])
    if changed: command(dc+['up','-d','--no-deps','--no-build','--pull','never']+services,timeout=120)
    print('Previous source and images restored', flush=True)
    raise
finally:
    if canary_started: subprocess.run(['docker','rm','-f',canary],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
