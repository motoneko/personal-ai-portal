#!/bin/sh
set -eu
[ "$(id -u)" = 0 ] || { echo 'Run as root'; exit 1; }
cd "$(dirname "$0")"
command -v fail2ban-client >/dev/null
install -d -m 755 /opt/personal-ai-portal-security
install -m 644 notify.py /opt/personal-ai-portal-security/notify.py
install -m 644 portal-login.conf portal-burst.conf /etc/fail2ban/filter.d/
install -m 644 portal-ban.conf portal-alert.conf /etc/fail2ban/action.d/
install -m 644 portal.local /etc/fail2ban/jail.d/portal.local
install -d -m 700 /etc/personal-ai-portal
if [ ! -f /etc/personal-ai-portal/alerts.env ]; then
    install -m 600 alerts.env.example /etc/personal-ai-portal/alerts.env
fi
install -m 644 portal-security-mail.service portal-security-mail.timer /etc/systemd/system/
install -m 644 logrotate.conf /etc/logrotate.d/personal-ai-portal-security
fail2ban-client -t
systemctl daemon-reload
systemctl enable --now fail2ban
systemctl restart fail2ban
systemctl enable --now portal-security-mail.timer
echo 'Protection installed. Configure private alerts.env and send a test notification to verify email.'
