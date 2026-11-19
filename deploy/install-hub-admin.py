"""Install the isolated Hub editor; preserve the employee backend and database."""
from pathlib import Path
import subprocess, shutil, time, os, sqlite3, json
assert os.getuid() == 0
source = Path(__file__).resolve().parent.parent
base = Path('/opt/sizey/hub-api')
assert (base/'.env').is_file() and (base/'docker-compose.yml').is_file()
backup = Path('/opt/sizey/backups') / ('hub-admin-'+str(int(time.time())))
backup.mkdir(parents=True, mode=0o700)
os.chmod(backup, 0o700)

def run(args, stdin=None):
    result = subprocess.run(args, input=stdin, capture_output=True, text=True)
    with (backup/'deployment.log').open('a') as log: log.write(result.stdout+'\n'+result.stderr+'\n')
    os.chmod(backup/'deployment.log',0o600)
    if result.returncode:
        raise RuntimeError('Failed operation: '+args[0]+' '+args[1]+' (private diagnostics retained on server)')
    return result.stdout

shutil.copytree(base/'server', backup/'server')
for name in ['auth.sqlite', 'hub-content.sqlite']:
    path=base/'data'/name
    if path.exists():
        a=sqlite3.connect(path);b=sqlite3.connect(backup/name);a.backup(b);a.close();b.close();os.chmod(backup/name,0o600)
old_image=run(['docker','inspect','sizey-hub-api','--format','{{.Image}}']).strip()
run(['docker','tag',old_image,'sizey-hub-api:before-admin'])
inner=Path('/opt/sizey/hub/Caddyfile');outer=Path('/opt/sizey/proxy/Caddyfile')
old_inner=inner.read_text();old_outer=outer.read_text()
(backup/'hub-Caddyfile').write_text(old_inner);(backup/'proxy-Caddyfile').write_text(old_outer)
dc=['docker','compose','-f',str(base/'docker-compose.yml')]
files=['Dockerfile','package.json','package-lock.json','auth.mjs','start.mjs','loyalty.mjs','import-customers.mjs','passwords.mjs','staff.mjs','provision-passwords.mjs','admin.mjs','analytics.mjs','geo.mjs','content-store.mjs','catalog-seed.json','categories-seed.json']
for name in files:shutil.copy2(source/'server'/name,base/'server'/name)
canary='sizey-hub-admin-canary'
inner_changed=False;outer_changed=False;api_changed=False
try:
    run(dc+['config','-q']);run(dc+['build','auth']);print('Editor image built',flush=True)
    run(['docker','run','-d','--name',canary,'--init','--network','proxy','--env-file',str(base/'.env'),'-v',str(base/'data')+':/data','sizey-hub-api:local'])
    run(['docker','network','connect','sizey_prod',canary])
    health="const base='http://127.0.0.1:8080/hub-api';const h=await fetch(base+'/health');if(!h.ok)throw Error('health');const c=await(await fetch(base+'/content')).json();if(!Array.isArray(c.products)||!c.products.length||!Array.isArray(c.banners))throw Error('catalog');if((await fetch(base+'/admin/me')).status!==401)throw Error('protection');console.log(JSON.stringify({products:c.products.length,banners:c.banners.length,protected:true}))"
    for attempt in range(20):
        try:
            result=run(['docker','exec',canary,'node','--input-type=module','-e',health]);break
        except RuntimeError:
            if attempt==19:raise
            time.sleep(1)
    print('Isolated verification:',result.strip(),flush=True)
    run(['docker','rm','-f',canary])
    api_changed=True;run(dc+['up','-d','--no-deps','--no-build','--pull','never','auth'])
    new_inner=(source/'deploy/hub-Caddyfile').read_text()
    staged=backup/'hub-check';staged.write_text(new_inner)
    run(['docker','cp',str(staged),'sizey-hub:/tmp/admin-check'])
    run(['docker','exec','sizey-hub','caddy','validate','--config','/tmp/admin-check','--adapter','caddyfile'])
    inner_changed=True;inner.write_text(new_inner)
    run(['docker','exec','sizey-hub','caddy','reload','--config','/etc/caddy/Caddyfile','--adapter','caddyfile'])
    if 'admmm.sizey.ru' not in old_outer:
        new_outer=old_outer+'\n\nadmmm.sizey.ru {\n    import security\n    reverse_proxy sizey-hub:80\n}\n'
        staged=backup/'proxy-check';staged.write_text(new_outer)
        run(['docker','cp',str(staged),'sizey-proxy:/tmp/admin-check'])
        run(['docker','exec','sizey-proxy','caddy','validate','--config','/tmp/admin-check','--adapter','caddyfile'])
        outer_changed=True;outer.write_text(new_outer)
        run(['docker','kill','--signal=USR1','sizey-proxy'])
    # Read-only canary: authenticate an existing administrator in server memory.
    # Neither the signed short-lived token nor customer records leave the container.
    pg=json.loads(run(['docker','inspect','sizey-prod-postgres']))[0]
    env=dict(x.split('=',1) for x in pg['Config']['Env'])
    admin_id=run(['docker','exec','sizey-prod-postgres','psql','-U',env['POSTGRES_USER'],'-d',env['POSTGRES_DB'],'-At','-c',"SELECT id FROM users WHERE role='ADMIN' AND status='ACTIVE' LIMIT 1"]).strip()
    assert admin_id and len(admin_id)<100
    smoke="""const crypto=require('node:crypto');(async()=>{const id=process.argv[1];const secret=process.env.JWT_SECRET;if(!secret)throw Error('JWT configuration');const encode=v=>Buffer.from(JSON.stringify(v)).toString('base64url');const data=encode({alg:'HS256',typ:'JWT'})+'.'+encode({sub:id,role:'ADMIN',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+60});const token=data+'.'+crypto.createHmac('sha256',secret).update(data).digest('base64url');const base='http://sizey-hub-api:8080/hub-api/admin';const r=await fetch(base+'/session',{method:'POST',headers:{Origin:'https://admmm.sizey.ru','Content-Type':'application/json',Authorization:'Bearer '+token},body:'{}'});if(r.status!==200)throw Error('Employee integration '+r.status);const cookie=r.headers.get('set-cookie').split(';')[0];const counts={};for(const name of ['products','banners','clients','orders']){const q=await fetch(base+'/'+name,{headers:{cookie}});if(!q.ok)throw Error('Read '+name+' '+q.status);counts[name]=(await q.json())[name].length}const report=await fetch(base+'/analytics?days=7',{headers:{cookie}});if(!report.ok)throw Error('Analytics access');const a=await report.json();if(!Array.isArray(a.formFactors)||!Array.isArray(a.sources)||!a.comparison||!a.geography?.enabled||a.retentionDays!==90)throw Error('Analytics report');counts.analyticsReady=true;await fetch(base+'/logout',{method:'POST',headers:{Origin:'https://admmm.sizey.ru','Content-Type':'application/json',cookie},body:'{}'});console.log(JSON.stringify({employeeAdminVerified:true,...counts}));})().catch(e=>{console.error(e.message);process.exit(1)})"""
    for attempt in range(20):
        try:
            result=run(['docker','exec','sizey-prod-backend','node','-e',smoke,admin_id]);break
        except RuntimeError:
            if attempt==19:raise
            time.sleep(1)
    print('Production read-only verification:',result.strip(),flush=True)
    print('Admin API and routing ready; existing bonus containers were not restarted.',flush=True)
except Exception:
    subprocess.run(['docker','rm','-f',canary],capture_output=True)
    if outer_changed:
        outer.write_text(old_outer);run(['docker','kill','--signal=USR1','sizey-proxy'])
    if inner_changed:
        inner.write_text(old_inner);run(['docker','exec','sizey-hub','caddy','reload','--config','/etc/caddy/Caddyfile','--adapter','caddyfile'])
    shutil.copytree(backup/'server',base/'server',dirs_exist_ok=True)
    if api_changed:
        run(['docker','tag',old_image,'sizey-hub-api:local']);run(dc+['up','-d','--no-deps','--no-build','--pull','never','auth'])
    print('Deployment rolled back; databases preserved.',flush=True)
    raise
