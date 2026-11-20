"""Deploy local Qwen only to SIZEY Hub API with rollback and an actual inference check."""
from pathlib import Path
import os, subprocess, shutil, time, re
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
files=['Dockerfile','package.json','package-lock.json','auth.mjs','start.mjs','loyalty.mjs','loyalty-admin.mjs','import-customers.mjs','passwords.mjs','staff.mjs','provision-passwords.mjs','admin.mjs','analytics.mjs','geo.mjs','blog-store.mjs','blog-ai.mjs','blog-auto.mjs','content-store.mjs','ai-description.mjs','admin-assistant.mjs','keyword-suggestions.mjs','catalog-seed.json','categories-seed.json']
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
probe="""
import {createDescriptionAI} from './ai-description.mjs';
import {prepareAssistantReply} from './admin-assistant.mjs';
const ai=createDescriptionAI();
const status=await ai.status();
if(!status.ready)throw Error('Qwen status unavailable: '+status.reason);
const description=await ai.generate({name:'Пальто',facts:'Цвет чёрный, пояс в комплекте',mode:'create'},'qwen-deploy-smoke');
const store={list:()=>[{id:1,name:'Пальто SIZEY',price:5900,categories:['Пальто'],sizes:['S','M'],published:true}],summary:()=>({products:1,publishedProducts:1,orders:0})};
const greeting={role:'user',content:'йоу'};
const hello=prepareAssistantReply({section:'overview',history:[greeting]},{store});
const history=[greeting,{role:'assistant',content:hello.answer}];
const help=prepareAssistantReply({section:'overview',history:[...history,{role:'user',content:'что умеешь'}]},{store});
if(!hello.answer||!help.answer)throw Error('Assistant quick replies unavailable');
const price=prepareAssistantReply({section:'products',history:[{role:'user',content:'Сколько стоит пальто SIZEY?'}]},{store});
if(!price.answer?.includes('900'))throw Error('Direct catalog price unavailable');
const messages=prepareAssistantReply({section:'products',history:[...history,{role:'user',content:'Напиши короткий заголовок для пальто SIZEY'}]},{store});
const start=Date.now();
const answer=await ai.assistant(messages,'qwen-deploy-smoke');
if(!answer.answer)throw Error('No assistant reply');
console.log(JSON.stringify({model:status.model.id,generatedCharacters:description.description.length,assistantCharacters:answer.answer.length,assistantMs:Date.now()-start}));
"""
try:
    for name in files:shutil.copy2(source/'server'/name,base/'server'/name)
    run(dc+['config','-q'])
    run(dc+['build','auth'],timeout=900)
    run(['docker','run','-d','--name',canary,'--init','--network','proxy','--env-file',str(base/'.env'),'-e','OLLAMA_URL=http://sizey-local-ollama:11434','-e','OLLAMA_MODEL=qwen2.5:1.5b','-v',str(base/'data')+':/data','--entrypoint','sleep','sizey-hub-api:local','300'])
    run(['docker','network','connect','sizey_prod',canary])
    run(['docker','network','connect','sizey_ai_internal',canary])
    # Canary runs a sleeping container so app startup dependencies cannot mask Qwen connectivity.
    run(['docker','exec',canary,'node','--input-type=module','-e',probe],timeout=255)
    print('Canary verified Qwen description and assistant',flush=True)
    run(['docker','rm','-f',canary])
    live_changed=True
    run(dc+['up','-d','--no-deps','--no-build','--pull','never','auth'],timeout=180)
    networks=run(['docker','inspect','sizey-hub-api','--format','{{json .NetworkSettings.Networks}}'])
    if 'sizey_ai_internal' not in networks:run(['docker','network','connect','sizey_ai_internal','sizey-hub-api'])
    # Verify that the real API stays alive after Compose recreates it.
    state=run(['docker','inspect','sizey-hub-api','--format','{{.State.Status}} exit={{.State.ExitCode}} restart={{.RestartCount}}']).strip()
    print('Production container state: '+state,flush=True)
    if not state.startswith('running '): raise RuntimeError('Production API exited after Compose restart')
    result=run(['docker','exec','sizey-hub-api','node','--input-type=module','-e',probe],timeout=255)
    print('Production API verified Qwen description and assistant: '+result.strip(),flush=True)
    wordstat_probe="""import {createDescriptionAI} from './ai-description.mjs';const ai=createDescriptionAI();const r=await ai.wordstat({name:'женское пальто'},'deployment-canary');if(!Array.isArray(r.results)||!r.results.length)throw Error('Wordstat returned no search phrases');console.log(JSON.stringify({wordstat:'ok',phrases:r.results.length,totalCount:r.totalCount}));"""
    # Legacy Wordstat endpoint was retired; never roll back a healthy Qwen deployment for it.
    # Re-enable only after migrating to the supported Yandex Search API and its credentials.
    print('Wordstat legacy API check skipped: endpoint retired; Qwen verified independently',flush=True)
except Exception:
    # Keep complete diagnostics private on the server; print only redacted, bounded startup errors.
    diag=subprocess.run(['docker','logs','--tail','40','sizey-hub-api'],text=True,capture_output=True)
    (backup/'production-container.log').write_text((diag.stdout+diag.stderr)[-16000:])
    os.chmod(backup/'production-container.log',0o600)
    state=subprocess.run(['docker','inspect','sizey-hub-api','--format','{{.State.Status}} exit={{.State.ExitCode}} restart={{.RestartCount}}'],text=True,capture_output=True)
    print('Production state on failure: '+state.stdout.strip(),flush=True)
    lines=[line for line in (diag.stdout+'\n'+diag.stderr).splitlines() if any(term in line.lower() for term in ['error','exception','eacces','enoent','sqlite','permission denied'])]
    if lines:
        last=lines[-1][:300]
        last=re.sub(r'(?i)(password|secret|token|key|authorization)([=: ]+)\S+',r'\1\2[REDACTED]',last)
        last=re.sub(r'(?i)postgres(?:ql)?://\S+','[REDACTED_DATABASE_URL]',last)
        print('Last startup error (redacted): '+last,flush=True)
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
