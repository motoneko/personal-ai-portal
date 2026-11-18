#!/usr/bin/env python3
"""Preserve real client IP through the existing local HAProxy TCP mux."""
from pathlib import Path
import datetime
import ipaddress
import shutil
import subprocess
import urllib.request

path = Path('/etc/haproxy/haproxy.cfg')
source = path.read_text()
if '# portal client IP verification' in source:
    raise SystemExit('Portal client IP verification already configured.')
ranges = []
for version in (4, 6):
    with urllib.request.urlopen(f'https://www.cloudflare.com/ips-v{version}', timeout=20) as response:
        lines = response.read().decode().splitlines()
    nets = [ipaddress.ip_network(line.strip()) for line in lines if line.strip()]
    if not nets or any(net.version != version or net.prefixlen == 0 for net in nets):
        raise SystemExit('Invalid Cloudflare ranges; no changes made.')
    ranges.extend(str(net) for net in nets)
cf = Path('/etc/haproxy/portal-cloudflare.lst')
cf.write_text('\n'.join(ranges) + '\n')
updated = source
for needle, replacement in (
    ('    server tls 127.0.0.1:9443 check', '    server tls 127.0.0.1:9443 check send-proxy-v2'),
    ('    server http 127.0.0.1:9080 check', '    server http 127.0.0.1:9080 check send-proxy-v2'),
    ('    bind 127.0.0.1:9443 ssl ', '    bind 127.0.0.1:9443 accept-proxy ssl '),
    ('    bind 127.0.0.1:9080\n', '    bind 127.0.0.1:9080 accept-proxy\n'),
):
    if updated.count(needle) != 1:
        raise SystemExit('Unexpected proxy topology; review manually before applying.')
    updated = updated.replace(needle, replacement)
needle = 'backend personal_ai_portal\n    mode http\n'
if updated.count(needle) != 1:
    raise SystemExit('Expected Portal backend not found.')
updated = updated.replace(needle, needle + '''    # portal client IP verification
    acl portal_cloudflare src -f /etc/haproxy/portal-cloudflare.lst
    http-request set-header X-Portal-Client-IP %[src]
    http-request set-header X-Portal-Client-IP %[req.hdr_ip(CF-Connecting-IP)] if portal_cloudflare { req.hdr_ip(CF-Connecting-IP) -m found }
''')
backup = path.with_name(path.name + '.bak-portal-security-' + datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ'))
shutil.copy2(path, backup)
try:
    path.write_text(updated)
    subprocess.run(['haproxy', '-c', '-f', str(path)], check=True)
    subprocess.run(['systemctl', 'reload', 'haproxy'], check=True)
except Exception:
    shutil.copy2(backup, path)
    subprocess.run(['systemctl', 'reload', 'haproxy'], check=False)
    raise
print('Verified proxy client IP forwarding applied. Backup:', backup)
