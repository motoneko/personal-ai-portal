#!/usr/bin/env python3
"""Process explicitly confirmed email recovery jobs; never expose Docker to the web app."""
import fcntl
import ipaddress
import json
import subprocess
import time


def command(name, *args):
    result = subprocess.run(['/usr/bin/docker', 'exec', 'personal-ai-portal',
        '/usr/local/bin/portal', 'security-recovery-' + name, *args],
        capture_output=True, text=True, timeout=12, check=True)
    return json.loads(result.stdout) if result.stdout.strip() else None


def process(run=command, unban=None, pause=time.sleep):
    if unban is None:
        def unban(ip):
            subprocess.run(['/usr/bin/fail2ban-client', 'set', 'portal-login', 'unbanip', ip],
                capture_output=True, timeout=12, check=True)
    for job in run('jobs'):
        claim = run('claim', job)
        if not claim.get('ip'):
            continue
        try:
            ip = str(ipaddress.ip_address(claim['ip']))
            unban(ip)
            run('apply', job)
            for _ in range(10):
                state = run('finish', job)['status']
                if state != 'processing':
                    print('Email recovery result:', state)
                    break
                pause(1)
            else:
                run('fail', job)
                print('Email recovery failed: unban not confirmed')
        except Exception as exc:
            run('fail', job)
            print('Email recovery failed; no automatic replay. Error type:', type(exc).__name__)


if __name__ == '__main__':
    # Same persistent private directory as the mail queue; never log bearer tokens.
    with open('/var/lib/personal-ai-portal-alerts/recovery.lock', 'a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        process()
