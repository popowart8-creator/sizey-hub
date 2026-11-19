"""Deploy local Qwen only to SIZEY Hub API with rollback and an actual inference check."""
from pathlib import Path
import os, subprocess, shutil, time
assert os.getuid() == 0
source = Path(__file__).resolve().parent.parent
base = Path('/opt/sizey/hub-api')
compose = base/'docker-compose.yml'
assert compose.is_file() and (base/'.env').is_file()
backup = Path('/opt/sizey/backups')/('qwen-api-'+str(int(time.time())))
backup.mkdir(parents=True,mode=0o700)
os.chmod(backup,0o700)
def run(args,timeout=240):
    p=subprocess.run(args,text=True,capture_output=True,timeout=timeout)
    with (backup/'deployment.log').open('a') as f:
        f.write(p.stdout+'\n'+p.stderr+'\n')
    os.chmod(backup/'deployment.log',0o600)
    if p.returncode:
        if args[:2] == ['docker','exec']:
            print('Qwen canary probe failed (last 1600 chars): '+(p.stderr or p.stdout)[-1600:],flush=True)
        raise RuntimeError('Command failed: '+args[0]+'; private logs saved on server')
    return p.stdout
files=['Dockerfile','package.json','package-lock.json','auth.mjs','start.mjs','loyalty.mjs','import-customers.mjs','passwords.mjs','staff.mjs','provision-passwords.mjs','admin.mjs','analytics.mjs','geo.mjs','content-store.mjs','ai-description.mjs','catalog-seed.json','categories-seed.json']
for name in files: assert (source/'server'/name).is_file()
assert 'qwen2.5:1.5b' in run(['docker','exec','sizey-local-ollama','ollama','list'])
run(['docker','network','inspect','sizey_ai_internal']) if subprocess.run(['docker','network','inspect','sizey_ai_internal'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode==0 else run(['docker','network','create','--internal','sizey_ai_internal'])
for container in ['sizey-local-ollama']:
    networks=run(['docker','inspect',container,'--format','{{json .NetworkSettings.Networks}}'])
    if 'sizey_ai_internal' not in networks:run(['docker','network','connect','sizey_ai_internal',container])
old_image=run(['docker','inspect','sizey-hub-api','--format','{{.Image}}']).strip()
run(['docker','tag',old_image,'sizey-hub-api:qwen-rollback'])
shutil.copytree(base/'server',backup/'server')
override=base/'docker-compose.qwen.yml'
previous=override.read_bytes() if override.exists() else None
if previous is not None:(backup/'previous-override.yml').write_bytes(previous)
override.write_text('services:\n  auth:\n    environment:\n      OLLAMA_URL: http://sizey-local-ollama:11434\n      OLLAMA_MODEL: qwen2.5:1.5b\n')
dc=['docker','compose','-f',str(compose),'-f',str(override)]
canary='sizey-qwen-api-canary'
live_changed=False
probe="""import {createDescriptionAI} from './ai-description.mjs';const ai=createDescriptionAI();const s=await ai.status();if(!s.ready)throw Error('Qwen status unavailable: '+s.reason);const r=await ai.generate({name:'Пальто',facts:'Цвет чёрный, пояс в комплекте',mode:'create'},'qwen-deploy-smoke');if(!r.description||r.description.length<20)throw Error('No generated text');console.log(JSON.stringify({model:s.model.id,ready:s.ready,generatedCharacters:r.description.length}));"""
try:
    for name in files:shutil.copy2(source/'server'/name,base/'server'/name)
    run(dc+['config','-q'])
    run(dc+['build','auth'],timeout=900)
    run(['docker','run','-d','--name',canary,'--init','--network','proxy','--env-file',str(base/'.env'),'-e','OLLAMA_URL=http://sizey-local-ollama:11434','-e','OLLAMA_MODEL=qwen2.5:1.5b','-v',str(base/'data')+':/data','--entrypoint','sleep','sizey-hub-api:local','300'])
    run(['docker','network','connect','sizey_prod',canary])
    run(['docker','network','connect','sizey_ai_internal',canary])
    # Canary runs a sleeping container so app startup dependencies cannot mask Qwen connectivity.
    run(['docker','exec',canary,'node','--input-type=module','-e',probe],timeout=150)
    print('Canary generated a Qwen description successfully',flush=True)
    run(['docker','rm','-f',canary])
    live_changed=True
    run(dc+['up','-d','--no-deps','--no-build','--pull','never','auth'],timeout=180)
    networks=run(['docker','inspect','sizey-hub-api','--format','{{json .NetworkSettings.Networks}}'])
    if 'sizey_ai_internal' not in networks:run(['docker','network','connect','sizey_ai_internal','sizey-hub-api'])
    result=run(['docker','exec','sizey-hub-api','node','--input-type=module','-e',probe],timeout=150)
    print('Production API generated Qwen description: '+result.strip(),flush=True)
except Exception:
    subprocess.run(['docker','rm','-f',canary],capture_output=True)
    shutil.copytree(backup/'server',base/'server',dirs_exist_ok=True)
    if previous is None:override.unlink(missing_ok=True)
    else:override.write_bytes(previous)
    run(['docker','tag','sizey-hub-api:qwen-rollback','sizey-hub-api:local'])
    if live_changed:
        olddc=['docker','compose','-f',str(compose)]
        if previous is not None:olddc+=['-f',str(override)]
        run(olddc+['up','-d','--no-deps','--no-build','--pull','never','auth'])
    print('Qwen API deployment rolled back',flush=True)
    raise
