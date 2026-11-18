#!/usr/bin/env python3
"""Add the portal alongside an existing sub2api_app backend; preserve other routes.
Run as root: python3 configure-haproxy.py /etc/haproxy/haproxy.cfg
The existing frontends must already define sub2api_host and route to sub2api_app.
"""
from pathlib import Path
import datetime
import shutil
import subprocess
import sys
import re

path = Path(sys.argv[1] if len(sys.argv) > 1 else '/etc/haproxy/haproxy.cfg')
source = path.read_text()
if 'backend personal_ai_portal' in source:
    raise SystemExit('Portal backend already exists; review existing config before changing it.')
backup = path.with_name(path.name + '.bak-portal-' + datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ'))
needle = '    use_backend sub2api_app if sub2api_host'
routes = '''    acl portal_path path / /chat /tools /read /lab /status /quota /portal-login
    acl portal_path path_beg /chat/ /tools/ /read/ /lab/ /status/ /quota/ /portal-login/ /portal-assets/ /portal-api/
    http-request redirect scheme https code 308 if sub2api_host portal_path !{ ssl_fc } !{ hdr(X-Forwarded-Proto) -i https }
    use_backend personal_ai_portal if sub2api_host portal_path
'''
if needle not in source:
    raise SystemExit('Expected host routing not found; adapt the example to your proxy first.')
def update_frontend(match):
    block = match.group(0)
    if needle not in block:
        return block
    host = next((line for line in block.splitlines() if line.strip().startswith('acl sub2api_host ')), None)
    if host is None:
        raise SystemExit('Host ACL missing from frontend')
    block = block.replace(host + '\n', '')
    first_backend = block.index('    use_backend ')
    acl_lines, backend_line = routes.rsplit('    use_backend ', 1)
    block = block[:first_backend] + host + '\n' + acl_lines + block[first_backend:]
    return block.replace(needle, '    use_backend ' + backend_line + needle)

updated = re.sub(r'^frontend .*?(?=^(?:frontend|backend|listen) |\Z)', update_frontend, source, flags=re.M | re.S)
updated = updated.replace('http-response set-header Cache-Control "no-store"', 'http-response set-header Cache-Control "no-store" unless { res.hdr(X-Portal-Cache) -m str immutable }')
updated += """
backend personal_ai_portal
    mode http
    timeout server 200s
    timeout tunnel 1h
    http-request set-header X-Forwarded-Proto https
    http-request set-header X-Forwarded-Port 443
    server portal 127.0.0.1:8090 check
"""
shutil.copy2(path, backup)
try:
    path.write_text(updated)
    subprocess.run(['haproxy', '-c', '-f', str(path)], check=True)
    subprocess.run(['systemctl', 'reload', 'haproxy'], check=True)
except Exception:
    shutil.copy2(backup, path)
    subprocess.run(['systemctl', 'reload', 'haproxy'], check=False)
    raise
print('Applied. Backup:', backup)
