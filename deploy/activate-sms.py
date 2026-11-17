"""Read provider key from stdin only. Do not log it."""
import sys,re,os,subprocess
from pathlib import Path
key=sys.stdin.read().strip()
if not re.fullmatch(r'[A-Za-z0-9_-]{16,200}',key):raise SystemExit('Invalid SMS provider key format')
p=Path('/opt/sizey/hub-api/.env')
lines=[line for line in p.read_text().splitlines() if not line.startswith('SMS_RU_API_ID=')]
p.write_text('\n'.join(lines+['SMS_RU_API_ID='+key])+'\n')
os.chmod(p,0o600)
r=subprocess.run(['docker','compose','-f','/opt/sizey/hub-api/docker-compose.yml','up','-d','--no-deps','--no-build','auth'],capture_output=True,text=True)
if r.returncode:raise SystemExit('Customer API restart failed; review server logs')
print('Customer SMS provider configured')
