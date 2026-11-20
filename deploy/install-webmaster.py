"""Deploy Yandex Webmaster API support without changing Qwen or frontend."""
import os, subprocess, shutil, time
from pathlib import Path

base=Path('/opt/sizey/hub-api')
compose=base/'docker-compose.yml'
qwen=base/'docker-compose.qwen.yml'
override=base/'docker-compose.webmaster.yml'
secret_file=base/'webmaster.env'
source=Path(__file__).resolve().parent.parent/'server'/'admin.mjs'
assert os.getuid()==0 and compose.is_file() and (base/'.env').is_file()
assert source.is_file() and secret_file.is_file()
backup=Path('/opt/sizey/backups')/('webmaster-'+str(int(time.time())))
backup.mkdir(parents=True,mode=0o700)
shutil.copy2(base/'server'/'admin.mjs',backup/'admin.mjs')
old_override=override.read_bytes() if override.exists() else None
if old_override is not None:(backup/'webmaster-override.yml').write_bytes(old_override)
old_image=subprocess.check_output(['docker','inspect','sizey-hub-api','--format','{{.Image}}'],text=True).strip()
subprocess.run(['docker','tag',old_image,'sizey-hub-api:webmaster-rollback'],check=True)
dc=['docker','compose','-f',str(compose)]
if qwen.is_file():dc+=['-f',str(qwen)]
dc+=['-f',str(override)]
changed=False
def run(args,timeout=600):
    subprocess.run(args,check=True,timeout=timeout,stdout=subprocess.DEVNULL)
try:
    override.write_text('services:\n  auth:\n    env_file:\n      - '+str(secret_file)+'\n')
    os.chmod(override,0o600)
    shutil.copy2(source,base/'server'/'admin.mjs')
    run(dc+['config','-q'])
    run(dc+['build','auth'],900)
    changed=True
    run(dc+['up','-d','--no-deps','--no-build','--pull','never','auth'],180)
    status=subprocess.check_output(['docker','inspect','sizey-hub-api','--format','{{.State.Status}}'],text=True).strip()
    if status!='running':raise RuntimeError('API container not running')
    # Only check presence of credential, never print its value.
    run(['docker','exec','sizey-hub-api','node','-e',"if(!process.env.YANDEX_WEBMASTER_TOKEN)process.exit(1)"])
    print('Webmaster API deployed; token present in container (hidden).')
except Exception:
    shutil.copy2(backup/'admin.mjs',base/'server'/'admin.mjs')
    if old_override is None:override.unlink(missing_ok=True)
    else:override.write_bytes(old_override)
    run(['docker','tag','sizey-hub-api:webmaster-rollback','sizey-hub-api:local'])
    if changed:
        previous=['docker','compose','-f',str(compose)]
        if qwen.is_file():previous+=['-f',str(qwen)]
        if old_override is not None:previous+=['-f',str(override)]
        run(previous+['up','-d','--no-deps','--no-build','--pull','never','auth'],180)
    print('Webmaster deployment rolled back')
    raise
