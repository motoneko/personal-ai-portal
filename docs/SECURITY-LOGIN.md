# 私人空间登录防爆破

仅保护 Portal 的 `/portal-api/login`。Sub2API 自身登录/API、已有 Portal 会话和服务器其他服务不在封禁范围内。

## 组件与规则

- [Fail2Ban](https://github.com/fail2ban/fail2ban)：读取应用失败日志，10 分钟内同一 IP 失败 6 次后封禁新登录 1 小时。
- Portal：保持每分钟全站最多 10 次密码验证，超出返回 429 和 Retry-After。每个窗口最多记录一次全局速率异常，避免攻击写满日志。
- Fail2Ban `portal-burst` jail：检测全局限流事件，排队告警，不额外封禁该事件的 IP，以免将分布式攻击期间的正常访客误封。
- 封禁写入 Portal SQLite 的 `login_bans`，重启容器仍有效，过期自动失效。Fail2Ban 的恢复操作也支持再次写入封禁。
- Python 标准库 SMTP 发送器：使用 SSL/TLS 或 STARTTLS，必须校验证书；持久队列、失败重试、全局 30 分钟邮件冷却。队列最多保留 10,000 条、7 天事件；发送最近 50 条明细及总数。
- 密码、请求正文、会话 cookie、API 密钥均不写入安全日志或邮件。

## 真实 IP 信任链

现有 HAProxy TCP mux 通过 PROXY v2 把连接来源转交本机 HTTP/TLS frontend；接收 PROXY 的端口仅绑定 localhost。

Portal backend 总是覆盖 `X-Portal-Client-IP`。仅当直接来源属于 Cloudflare 官方网段时，才使用 `CF-Connecting-IP`；其余连接使用真实来源地址。Portal 仅信任 `PORTAL_TRUSTED_PROXIES` 中指定的直接代理 CIDR，不信任访问者提交的 X-Forwarded-For。

部署脚本从 [Cloudflare IPv4](https://www.cloudflare.com/ips-v4) / [IPv6](https://www.cloudflare.com/ips-v6) 获取并验证网段，首次更新时备份 HAProxy 配置、校验语法并重载。网段文件 `/etc/haproxy/portal-cloudflare.lst` 需要在 Cloudflare 公布变更时更新并校验重载。不要将任意来源或整个 Docker 网络设为可信代理。

## 安装与维护

1. 部署带 `security.go` 的 Portal。为容器配置精确的代理 CIDR，例如确认网关为 172.18.0.1 后设置 `PORTAL_TRUSTED_PROXIES=172.18.0.1/32`。
2. 根据实际代理拓扑检查并运行 `sudo python3 deploy/security/configure-proxy.py`。脚本只适配本仓库现有部署，遇到不一致会停止。
3. 安装 `fail2ban`。把 `portal-login.conf` / `portal-burst.conf` 放到 `/etc/fail2ban/filter.d/`；`portal-ban.conf` / `portal-alert.conf` 放到 `/etc/fail2ban/action.d/`；`portal.local` 放到 `/etc/fail2ban/jail.d/`。按实际卷名称调整 logpath。
4. `notify.py` 放到 `/opt/personal-ai-portal-security/`，目录/文件由 root 拥有，禁止普通用户写入。
5. systemd service/timer 放到 `/etc/systemd/system/`。将 `alerts.env.example` 复制到 `/etc/personal-ai-portal/alerts.env`，目录 0700、文件 0600，由 root 拥有。设置收件地址、发件邮箱及 SMTP 授权码；不要提交这些配置。
6. `logrotate.conf` 安装到 `/etc/logrotate.d/personal-ai-portal-security`；默认每日或轮询发现超过 5 MB 时轮转，保留 7 份。配置 logpath 应与步骤 3 一致。
7. 运行 `fail2ban-client -t`、`systemctl restart fail2ban`、`systemctl daemon-reload`、`systemctl enable --now portal-security-mail.timer`。

本功能不要求开启 SSH jail；如果服务器已有 Fail2Ban，保留现有 jail 配置。

常用命令（服务器上）：

```sh
sudo fail2ban-client status portal-login
sudo fail2ban-client status portal-burst
sudo fail2ban-client set portal-login unbanip <IP>
sudo python3 /opt/personal-ai-portal-security/notify.py status
sudo journalctl -u portal-security-mail.service --since today
```

配置 SMTP 后，发送一封明确标记为测试的通知：

```sh
sudo python3 /opt/personal-ai-portal-security/notify.py enqueue test 127.0.0.1
sudo systemctl start portal-security-mail.service
```

全局邮件冷却同样适用于测试通知。SMTP 成功只代表发件服务器接受，仍需检查收件箱/垃圾邮件确认实际送达。未配置 SMTP 时，事件保留在队列并在服务日志显示 `unconfigured`，不能视为邮件告警已启用。

## 验证

Go 测试覆盖 IP 伪造、日志敏感信息边界、全局告警限量、封禁与过期、已有会话不受影响。Python 测试覆盖无配置保留队列、发送失败重试、全局去重冷却及 IP 日志注入拒绝。上线还应验证 Fail2Ban 日志匹配、实际封禁与解封，以及 SMTP 测试信。

相较于 [CrowdSec](https://docs.crowdsec.net/docs/local_api/notification_plugins/email/)，本部署选择 Fail2Ban 的独立日志检测；不引入 CrowdSec 的额外检测/决策组件。邮件发送器是本项目实现，并非 Fail2Ban 的原生 sendmail action，以提供统一队列和跨 IP 合并限频。
