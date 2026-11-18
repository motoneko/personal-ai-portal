#!/usr/bin/env python3
"""Extend an already configured Portal HAProxy route; preserve Sub2API routes."""
from pathlib import Path
import datetime
import re
import shutil
import subprocess
import sys

path = Path(sys.argv[1] if len(sys.argv) > 1 else '/etc/haproxy/haproxy.cfg')
source = path.read_text()
if 'backend personal_ai_portal' not in source:
    raise SystemExit('Configure the Portal backend first.')
def extend(match):
    line = match.group(0)
    prefix = 'path_beg' in line
    route = '/draw/' if prefix else '/draw'
    return line if route in line.split() else line + ' ' + route
updated = re.sub(r'^\s*acl portal_path path(?:_beg)? [^\n]+', extend, source, flags=re.M)
if updated == source:
    print('Drawnix routes already configured.')
    raise SystemExit(0)
backup = path.with_name(path.name + '.bak-drawnix-' + datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ'))
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
