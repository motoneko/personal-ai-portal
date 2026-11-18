#!/usr/bin/env python3
"""Persistent, rate-limited SMTP digests for Fail2Ban (Python standard library)."""
import argparse
import email.message
import email.utils
import fcntl
import ipaddress
import json
import subprocess
from urllib.parse import urlsplit
import os
from pathlib import Path
import smtplib
import sqlite3
import ssl
import time


def database(path):
    Path(path).parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    db = sqlite3.connect(path, timeout=10)
    os.chmod(path, 0o600)
    db.executescript('''CREATE TABLE IF NOT EXISTS events
      (id INTEGER PRIMARY KEY, kind TEXT, ip TEXT, created INTEGER);
      CREATE TABLE IF NOT EXISTS state (key TEXT PRIMARY KEY,value INTEGER);''')
    return db


def enqueue(db, kind, ip, now):
    ip = str(ipaddress.ip_address(ip))
    if kind not in ('login-ban', 'global-rate-limit', 'test'):
        raise ValueError('invalid event type')
    with db:
        # Bound disk use during sustained attacks; no passwords or request bodies.
        db.execute('DELETE FROM events WHERE created<?', (now - 7 * 86400,))
        db.execute('INSERT INTO events(kind,ip,created) VALUES(?,?,?)', (kind, ip, now))
        db.execute('DELETE FROM events WHERE id NOT IN (SELECT id FROM events ORDER BY id DESC LIMIT 10000)')


def smtp_send(message, config):
    host = config['SMTP_HOST']
    port = int(config.get('SMTP_PORT', '465'))
    mode = config.get('SMTP_SECURITY', 'ssl')
    ctx = ssl.create_default_context()
    if mode == 'ssl':
        client = smtplib.SMTP_SSL(host, port, timeout=20, context=ctx)
    elif mode == 'starttls':
        client = smtplib.SMTP(host, port, timeout=20)
        client.ehlo()
        client.starttls(context=ctx)
    else:
        raise ValueError('SMTP_SECURITY must be ssl or starttls')
    with client:
        client.login(config['SMTP_USERNAME'], config['SMTP_PASSWORD'])
        refused = client.send_message(message)
        if refused:
            raise RuntimeError('recipient rejected')


def recovery_link(ip, config):
    if config.get('EMAIL_RECOVERY_ENABLED') != 'true':
        return None
    site = config.get('ALERT_SITE', '').rstrip('/')
    parsed = urlsplit(site)
    if parsed.scheme != 'https' or not parsed.netloc or parsed.query or parsed.fragment:
        raise ValueError('Recovery requires a configured HTTPS site')
    result = subprocess.run(['/usr/bin/docker', 'exec', 'personal-ai-portal', '/usr/local/bin/portal',
        'security-recovery-token', str(ipaddress.ip_address(ip))], capture_output=True, text=True, timeout=12, check=True)
    token = json.loads(result.stdout).get('token')
    return site + '/portal-login/recover/#' + token if token else None


def deliver(db, config, now, sender=smtp_send, link_factory=recovery_link):
    last = db.execute("SELECT value FROM state WHERE key='last_sent'").fetchone()
    if last and now - last[0] < 1800:
        return 'cooldown'
    rows = db.execute('SELECT id,kind,ip,created FROM events ORDER BY id').fetchall()
    if not rows:
        return 'empty'
    required = ('SMTP_HOST', 'SMTP_USERNAME', 'SMTP_PASSWORD', 'SMTP_FROM', 'ALERT_TO')
    if any(not config.get(k) for k in required):
        return 'unconfigured: queued events retained; set private SMTP configuration'
    message = email.message.EmailMessage()
    message['Subject'] = ('[测试] Private Island 邮件与解封验证' if all(row[1] == 'test' for row in rows) else '[Private Island] 登录安全告警 / Login security alert')
    message['From'] = config['SMTP_FROM']
    message['To'] = config['ALERT_TO']
    message['Date'] = email.utils.formatdate(now, usegmt=True)
    message['Message-ID'] = email.utils.make_msgid()
    site = config.get('ALERT_SITE', 'personal-ai-portal')
    lines = [f'网站：{site}', f'本次合并 {len(rows)} 个事件。时间均为 UTC。', '',
        'login-ban：10 分钟内至少 6 次登录失败，来源 IP 已限制登录 1 小时。',
        'global-rate-limit：站点触发每分钟 10 次登录验证上限，超出请求已限流；不代表每次请求都输错了密码。',
        'test：通知测试，不是真实攻击。', '']
    for _, kind, ip, created in rows[-50:]:
        lines.append(f'{time.strftime("%Y-%m-%d %H:%M:%S", time.gmtime(created))}  {kind}  {ip}')
    if len(rows) > 50:
        lines.append('仅展示最近 50 条；其余事件已计入汇总。')
    if config.get('EMAIL_RECOVERY_ENABLED') == 'true':
        links = []
        seen = set()
        for _, kind, ip, _ in reversed(rows):
            if kind not in ('login-ban', 'test') or ip in seen:
                continue
            seen.add(ip)
            link = link_factory(ip, config)
            if link:
                links.extend([f'解封 {ip}：', link])
            if len(seen) >= 10:
                break
        if links:
            lines.extend(['', '如需恢复自己的 IP，请打开下面链接并点击“确认解封此 IP”。',
                '链接最长有效 30 分钟、仅限此次封禁、只能执行一次；不需要网站密码。',
                '请勿转发此邮件。打开或预览链接本身不会解封。', *links])
    lines.extend(['', '同类事件合并发送，所有告警合计最多每 30 分钟一封。',
        '封禁仅限制新的私人空间登录；已有会话、Sub2API API 和其他服务不受影响。',
        '如非本人操作，可检查服务器 Fail2Ban 状态。邮件不包含密码或 API 密钥。'])
    message.set_content('\n'.join(lines))
    sender(message, config)
    with db:
        db.execute('DELETE FROM events WHERE id<=?', (rows[-1][0],))
        db.execute("INSERT INTO state VALUES('last_sent',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", (now,))
    return 'accepted by SMTP server'


def main():
    os.umask(0o077)
    parser = argparse.ArgumentParser()
    parser.add_argument('command', choices=['enqueue', 'send', 'status'])
    parser.add_argument('kind', nargs='?')
    parser.add_argument('ip', nargs='?')
    args = parser.parse_args()
    path = os.environ.get('ALERT_DB', '/var/lib/personal-ai-portal-alerts/queue.db')
    db = database(path)
    now = int(time.time())
    if args.command == 'enqueue':
        enqueue(db, args.kind, args.ip, now)
    elif args.command == 'status':
        print('Pending events:', db.execute('SELECT count(*) FROM events').fetchone()[0])
    else:
        # Prevent overlapping systemd/manual delivery. SMTP errors leave the queue intact.
        with open(path + '.lock', 'a') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX)
            try:
                print(deliver(db, os.environ, now))
            except Exception as exc:
                # Never print server error text; it may contain credentials or message data.
                print('SMTP delivery failed; queued events retained. Error type:', type(exc).__name__)
                raise SystemExit(1)


if __name__ == '__main__':
    main()
