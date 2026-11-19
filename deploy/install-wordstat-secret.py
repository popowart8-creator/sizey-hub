"""Install Wordstat API secret on the server from standard input without logging it."""
import os
from pathlib import Path
import re
key=os.read(0,4096).decode('utf-8').strip()
if not re.fullmatch(r'[A-Za-z0-9_.-]{16,2048}',key):
    raise SystemExit('Invalid or missing Wordstat API key')
target=Path('/opt/sizey/hub-api/wordstat.env')
fd=os.open(str(target),os.O_WRONLY|os.O_CREAT|os.O_TRUNC,0o600)
with os.fdopen(fd,'w') as file:
    file.write('YANDEX_WORDSTAT_API_KEY='+key+'\n')
os.chmod(target,0o600)
print('Wordstat credentials installed (value hidden)')
