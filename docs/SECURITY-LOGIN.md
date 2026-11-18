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

部署脚本从 [Cloudflare 官方 IP API](https://developers.cloudflare.com/api/resources/ips/methods/list/) 获取并验证 IPv4/IPv6 网段，首次更新时备份 HAProxy 配置、校验语法并重载。网段文件 `/etc/haproxy/portal-cloudflare.lst` 需要在 Cloudflare 公布变更时更新并校验重载。不要将任意来源或整个 Docker 网络设为可信代理。

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

## 邮件解封

配置 `EMAIL_RECOVERY_ENABLED=true` 后，封禁告警会为最近最多 10 个仍处于封禁中的 IP 生成解封链接。链接指向 `/portal-login/recover/#TOKEN`，无需网站登录；打开页面后必须点击确认，GET 请求和邮件预览不会解封。只需要 SMTP 发信，不需要 IMAP 或读取邮箱。

令牌使用 256 位随机数，数据库只存 SHA-256 摘要；有效期为 30 分钟与原封禁剩余时间中的较短者。令牌绑定该 IP 的当次封禁到期值，旧链接不能解除后来的新封禁。确认会创建单次后台任务；重复确认不会再次执行解封。URL fragment 不会发送到服务器访问日志，确认和查询通过同源 POST 传递令牌。邮件属于解封凭据，不应转发。

主机 `portal-security-recovery.timer` 每 15 秒检查一次已确认申请。对应服务经受限的 CLI 获取任务，执行固定的 Fail2Ban 解封命令，再核对并清理对应的一次应用封禁；网页容器不挂载 Docker/Fail2Ban socket。命令失败或任务中断不会自动重复执行解封，页面会提示失败，可使用 SSH 或等待自动到期。

QQ 邮箱使用 `smtp.qq.com:465`、SSL/TLS、完整邮箱地址和专用授权码，发件人与收件人可按实际所有者配置。授权码生成参见 [QQ 官方说明](https://help.mail.qq.com/detail/106/985)。在服务器终端隐藏输入授权码：

```sh
sudo python3 /opt/personal-ai-portal-security/configure-mail.py
```

`configure-mail.py` 只原子更新 root-only 的 `SMTP_PASSWORD`，不在终端显示授权码，也不将其放入命令行参数或 shell 历史。配置后仍应发送测试邮件确认送达。服务日志只记录发送状态和错误类型，不记录凭据或解封令牌。
