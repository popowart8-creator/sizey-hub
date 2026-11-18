"""Preserve hashed release assets and atomically reload only the internal hub server."""
from pathlib import Path
import os,subprocess,time,shutil
assert os.getuid()==0
base=Path('/var/www/sizey-hub');shared=base/'assets';shared.mkdir(exist_ok=True)
owner=base.stat();os.chown(shared,owner.st_uid,owner.st_gid)
count=0
for folder in (base/'releases').iterdir():
    assets=folder/'assets'
    if not assets.is_dir():continue
    for src in assets.iterdir():
        if not src.is_file():continue
        dest=shared/src.name
        if not dest.exists():shutil.copy2(src,dest);count+=1
        os.chown(dest,owner.st_uid,owner.st_gid)
config=Path(__file__).with_name('hub-Caddyfile').read_text()
p=Path('/opt/sizey/hub/Caddyfile');old=p.read_text();backup=p.with_name('Caddyfile.before-cache-'+str(int(time.time())));backup.write_text(old)
check=Path('/opt/sizey/hub/Caddyfile.cache-check');check.write_text(config)
def run(args):
    r=subprocess.run(args,capture_output=True,text=True,timeout=60)
    assert r.returncode==0,'Internal static configuration failed validation or reload'
run(['docker','cp',str(check),'sizey-hub:/tmp/Caddyfile.cache-check'])
run(['docker','exec','sizey-hub','caddy','validate','--config','/tmp/Caddyfile.cache-check','--adapter','caddyfile'])
try:
    p.write_text(config)
    run(['docker','exec','sizey-hub','caddy','reload','--config','/etc/caddy/Caddyfile','--adapter','caddyfile'])
except Exception:
    p.write_text(old)
    run(['docker','exec','sizey-hub','caddy','reload','--config','/etc/caddy/Caddyfile','--adapter','caddyfile'])
    raise
print('Static routing reloaded; preserved hashed asset files:',count)
