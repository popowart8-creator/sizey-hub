"""One-time root setup. Does not export customer records or database credentials."""
from pathlib import Path
import subprocess,json,secrets,os,re,urllib.parse,shutil
base=Path('/opt/sizey/hub-api');base.mkdir(parents=True,exist_ok=True)
source=Path(__file__).resolve().parent.parent

def command(args,stdin=None):
    r=subprocess.run(args,input=stdin,capture_output=True,text=True)
    if r.returncode:
        # Avoid printing command arguments, database passwords or raw database rows.
        raise RuntimeError('Operation failed: '+args[0]+' / '+(args[1] if len(args)>1 else '')+' (exit '+str(r.returncode)+')')
    return r.stdout

assert os.getuid()==0
pg=json.loads(command(['docker','inspect','sizey-prod-postgres']))[0]
pg_env=dict(x.split('=',1) for x in pg['Config']['Env'])
admin,dbname=pg_env['POSTGRES_USER'],pg_env['POSTGRES_DB']
assert re.fullmatch(r'[A-Za-z0-9_]+',dbname)
def sql(query):return command(['docker','exec','-i','sizey-prod-postgres','psql','-v','ON_ERROR_STOP=1','-U',admin,'-d',dbname,'-At'],query)
env_path=base/'.env'
if not env_path.exists():
    assert sql("SELECT COUNT(*) FROM pg_roles WHERE rolname='sizey_hub_reader';").strip()=='0','Read-only role already exists; review before reusing'
    password=secrets.token_urlsafe(36)
    settings={'AUTH_SECRET':secrets.token_hex(32),'PUBLIC_ORIGIN':'https://hub.sizey.ru','LOYALTY_DATABASE_URL':'postgresql://sizey_hub_reader:'+password+'@sizey-prod-postgres:5432/'+dbname,'DATA_DIR':'/data'}
    fd=os.open(env_path,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
    with os.fdopen(fd,'w') as f:f.write(''.join(k+'='+v+'\n' for k,v in settings.items()))
else:
    settings=dict(line.split('=',1) for line in env_path.read_text().splitlines() if line and not line.startswith('#'))
    password=urllib.parse.urlsplit(settings['LOYALTY_DATABASE_URL']).password
assert re.fullmatch(r'[A-Za-z0-9_-]+',password)
role_exists=sql("SELECT COUNT(*) FROM pg_roles WHERE rolname='sizey_hub_reader';").strip()=='1'
if not role_exists:sql("CREATE ROLE sizey_hub_reader LOGIN PASSWORD '"+password+"' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;")
sql('''ALTER ROLE sizey_hub_reader SET default_transaction_read_only=on;
GRANT CONNECT ON DATABASE "'''+dbname+'''" TO sizey_hub_reader;
GRANT USAGE ON SCHEMA public TO sizey_hub_reader;
GRANT SELECT(id,name,phone_normalized,loyalty_level_id,deleted_at) ON clients TO sizey_hub_reader;
GRANT SELECT(id,name,percent) ON loyalty_levels TO sizey_hub_reader;
GRANT SELECT(client_id,remaining_amount,expires_at) ON bonus_lots TO sizey_hub_reader;
GRANT SELECT(id,client_id,type,balance_before,balance_after,created_at) ON transactions TO sizey_hub_reader;''')
print('Read-only loyalty role prepared; no existing customer records changed')
data=base/'data';data.mkdir(exist_ok=True,mode=0o700);os.chown(data,1000,1000)
for name in ['Dockerfile','package.json','package-lock.json','auth.mjs','start.mjs','loyalty.mjs','import-customers.mjs']:
    target=base/'server'/name;target.parent.mkdir(exist_ok=True);shutil.copy2(source/'server'/name,target)
compose='''services:
  auth:
    build:
      context: .
      dockerfile: server/Dockerfile
    image: sizey-hub-api:local
    container_name: sizey-hub-api
    init: true
    restart: unless-stopped
    env_file: .env
    volumes:
      - ./data:/data
    networks:
      - proxy
      - loyalty
networks:
  proxy:
    external: true
    name: proxy
  loyalty:
    external: true
    name: sizey_prod
'''
(base/'docker-compose.yml').write_text(compose)
dc=['docker','compose','-f',str(base/'docker-compose.yml')]
command(dc+['config','-q'])
command(dc+['build','auth'])
# Existing customer identities are imported on-server only, without SMS sessions.
result=command(dc+['run','--rm','--no-deps','auth','node','import-customers.mjs'])
for line in result.splitlines():
    if line.startswith('{'):print('Customer identity import:',line)
command(dc+['up','-d','--no-deps','auth'])
health="fetch('http://127.0.0.1:8080/hub-api/health').then(async r=>{if(!r.ok)process.exit(1);console.log(JSON.stringify(await r.json()))}).catch(()=>process.exit(1))"
import time
for attempt in range(15):
    try:
        result=command(['docker','exec','sizey-hub-api','node','-e',health]);print('Auth health:',result.strip());break
    except RuntimeError:
        if attempt==14:raise
        time.sleep(1)
# Verify only aggregates using read-only credentials; do not print balances or phones.
smoke="""import {loyaltyPool,createLoyaltyReader} from './loyalty.mjs';const p=loyaltyPool(process.env.LOYALTY_DATABASE_URL);try{const {rows}=await p.query('SELECT phone_normalized FROM clients WHERE deleted_at IS NULL');let linked=0;for(const c of rows){if(!/^7\\d{10}$/.test(c.phone_normalized))continue;const data=await createLoyaltyReader(p)('+'+c.phone_normalized);if(data.linked&&Number.isFinite(data.balance))linked++;else throw Error('Lookup failed')}let denied=false;try{await p.query('SELECT password_hash FROM users LIMIT 0')}catch{denied=true}if(!denied)throw Error('Role permissions too broad');console.log(JSON.stringify({linkedCustomers:linked,employeeCredentialsAccessDenied:denied}));}finally{await p.end()}"""
print('Loyalty verification:',command(['docker','exec','sizey-hub-api','node','--input-type=module','-e',smoke]).strip())
# Update only the internal SIZEY container; the bonus proxy and backend stay running.
caddy=Path('/opt/sizey/hub/Caddyfile');previous=caddy.read_text()
config=''':80 {
    handle /hub-api/* {
        reverse_proxy sizey-hub-api:8080 {
            header_up X-Real-IP {http.request.header.X-Forwarded-For}
        }
    }
    handle {
        root * /srv/current
        encode gzip
        header /index.html Cache-Control "no-cache"
        header /sw.js Cache-Control "no-cache"
        header /manifest.webmanifest Cache-Control "no-cache"
        try_files {path} /index.html
        file_server
    }
}
'''
check=base/'Caddyfile.check';check.write_text(config)
command(['docker','cp',str(check),'sizey-hub:/tmp/sizey-auth-Caddyfile'])
command(['docker','exec','sizey-hub','caddy','validate','--config','/tmp/sizey-auth-Caddyfile','--adapter','caddyfile'])
backup=caddy.with_name('Caddyfile.before-auth-'+str(int(time.time())));backup.write_text(previous)
try:
    caddy.write_text(config)
    command(['docker','exec','sizey-hub','caddy','reload','--config','/etc/caddy/Caddyfile','--adapter','caddyfile'])
except Exception:
    caddy.write_text(previous)
    command(['docker','exec','sizey-hub','caddy','reload','--config','/etc/caddy/Caddyfile','--adapter','caddyfile'])
    raise
print('Internal API routing installed without restarting the bonus system')
