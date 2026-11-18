#!/usr/bin/env python3
"""Root-only interactive setup; the authorization code never enters argv or shell history."""
import getpass
import os
from pathlib import Path
import re
import tempfile

if os.geteuid() != 0:
    raise SystemExit('请使用 sudo 运行。')
path = Path('/etc/personal-ai-portal/alerts.env')
if not path.exists():
    raise SystemExit('请先安装网站邮件告警服务。')
code = getpass.getpass('请粘贴 QQ 邮箱 16 位授权码（输入不显示）：').strip()
if not re.fullmatch(r'[A-Za-z0-9]{16}', code):
    raise SystemExit('格式不正确：需要 16 位授权码，不是 QQ 登录密码。配置未更改。')
lines = [line for line in path.read_text().splitlines() if not line.startswith('SMTP_PASSWORD=')]
lines.append('SMTP_PASSWORD=' + code)
fd, name = tempfile.mkstemp(dir=path.parent, prefix='.mail-')
try:
    with os.fdopen(fd, 'w') as out:
        out.write('\n'.join(lines) + '\n')
    os.chmod(name, 0o600)
    os.replace(name, path)
finally:
    if os.path.exists(name): os.unlink(name)
print('授权码已写入 root 私密配置，未回显。请通知助手进行实际发信验证。')
