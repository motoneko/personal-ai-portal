import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import {
  Button,
  Card,
  Title,
  Input,
  Select,
  Background,
  Tag,
  Progress,
  Avatar,
  Divider,
  Footer,
  Time,
  CodeBlock,
  Modal,
} from "animal-island-ui";
import {
  HomeIcon,
  LeafIcon,
  TreeIcon,
  FlowerIcon,
  SunIcon,
  CloudIcon,
  ChatIcon,
  WrenchIcon,
  BookOpenIcon,
  FlaskIcon,
  ActivityIcon,
  WalletIcon,
  ArrowRightIcon,
  PlusIcon,
  TrashIcon,
  SendIcon,
  CopyIcon,
  DownloadIcon,
  RefreshIcon,
  LockIcon,
  CompassIcon,
  BookmarkIcon,
  SettingsIcon,
  SparklesIcon,
  CoffeeIcon,
  SailboatIcon,
} from "naive-icons";
import "animal-island-ui/style";
import "./style.css";
import QRCode from "qrcode";
import { diffLines } from "diff";

const modules = [
  {
    id: "chat",
    title: "AI 聊天工作台",
    short: "聊天树屋",
    desc: "带上一个问题，和 AI 聊聊新的可能。",
    hint: "多模型对话 · 历史记录",
    color: "app-teal",
    Icon: ChatIcon,
  },
  {
    id: "tools",
    title: "个人工具箱",
    short: "万能工具铺",
    desc: "那些繁琐的小事，交给顺手的小工具。",
    hint: "本地处理 · 即开即用",
    color: "app-yellow",
    Icon: WrenchIcon,
  },
  {
    id: "read",
    title: "AI 阅读助手",
    short: "岛屿图书馆",
    desc: "把长长的文章，读成自己的小小收获。",
    hint: "摘要 · 翻译 · 阅读收藏",
    color: "app-green",
    Icon: BookOpenIcon,
  },
  {
    id: "lab",
    title: "灵感实验室",
    short: "灵感花园",
    desc: "种下一个想法，让故事和作品慢慢生长。",
    hint: "文字 · 网页 · 图片",
    color: "app-pink",
    Icon: FlaskIcon,
  },
  {
    id: "status",
    title: "服务状态页",
    short: "岛屿观测站",
    desc: "看看小岛的脉搏，一切是否运转如常。",
    hint: "服务健康 · 主机资源",
    color: "app-blue",
    Icon: ActivityIcon,
  },
  {
    id: "quota",
    title: "额度看板",
    short: "能量补给站",
    desc: "出发前，看看你的 AI 能量还剩多少。",
    hint: "账号额度 · 重置时间",
    color: "app-orange",
    Icon: WalletIcon,
  },
];
const pageID = location.pathname.split("/")[1] || "home";
const here = modules.find((m) => m.id === pageID);
let inform = () => {};
async function api(route, options = {}) {
  const opts = { credentials: "same-origin", ...options };
  if (opts.body) {
    opts.headers = { "Content-Type": "application/json" };
    opts.body = JSON.stringify(opts.body);
  }
  const r = await fetch("/portal-api/" + route, opts);
  const d = await r.json();
  if (!r.ok || d.error) {
    if (r.status === 401 && route !== "login")
      window.dispatchEvent(new Event("portal-session-expired"));
    throw Error(d.error || "请求暂时失败，请稍后再试");
  }
  return d;
}
const list = (kind) => api("records?kind=" + kind);
const save = (kind, title, body, id = "") =>
  api("records", {
    method: "POST",
    body: { kind, title, body: JSON.stringify(body), id },
  });
const go = (path) => {
  location.href = path;
};
const copy = (text) =>
  navigator.clipboard
    .writeText(text)
    .then(() => inform("已放进剪贴板"))
    .catch(() => inform("复制失败，请手动选择文本"));
function download(url, name) {
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
}
function downloadText(content, name) {
  const u = URL.createObjectURL(
    new Blob([content], {
      type: name.endsWith(".html") ? "text/html" : "text/plain",
    }),
  );
  download(u, name);
  setTimeout(() => URL.revokeObjectURL(u), 1000);
}
const stripHTML = (s) =>
  s.replace(/^\s*```(?:html)?\s*\n?/i, "").replace(/\n?```\s*$/, "");
const bytes = (n) => (Number(n) / 1024 / 1024 / 1024).toFixed(1) + " GB";
const date = (s) => {
  if (!s) return "暂无记录";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? "暂无记录" : d.toLocaleString("zh-CN");
};
function Label({ children, htmlFor }) {
  return <label htmlFor={htmlFor}>{children}</label>;
}
function PageHeader({ children, action }) {
  return (
    <div className="page-heading">
      <div>
        <Tag color={here?.color || "app-teal"} size="small">
          {here?.short || "欢迎登岛"}
        </Tag>
        <h1>{here?.title || "个人空间"}</h1>
        <p>{children || here?.desc}</p>
      </div>
      {action}
    </div>
  );
}
function Message({ children }) {
  return (
    <div className="notice" role="status">
      <LeafIcon size={22} />
      <span>{children}</span>
    </div>
  );
}
function Blank({ children, Icon = LeafIcon }) {
  return (
    <div className="empty">
      <Icon size={55} />
      <p>{children}</p>
    </div>
  );
}
function Confirm({ record, onClose, onDone }) {
  return (
    <Modal
      variant="game"
      open={!!record}
      title="要收起这段回忆吗？"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>再想想</Button>
          <Button
            type="primary"
            danger
            onClick={async () => {
              try {
                await api("records", {
                  method: "DELETE",
                  body: { id: record.id },
                });
                onDone();
                onClose();
                inform("已删除");
              } catch (e) {
                inform(e.message);
              }
            }}
          >
            确定删除
          </Button>
        </>
      }
    >
      <p>删除后无法恢复这条记录。</p>
    </Modal>
  );
}
function App() {
  const [session, setSession] = useState(null),
    [toast, setToast] = useState("");
  useEffect(() => {
    inform = setToast;
    api("session")
      .then(setSession)
      .catch(() => setSession({ authenticated: false, model: "gpt-6.1-sol" }));
    const expire = () => setSession((s) => ({ ...s, authenticated: false }));
    window.addEventListener("portal-session-expired", expire);
    return () => window.removeEventListener("portal-session-expired", expire);
  }, []);
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(""), 4000);
      return () => clearTimeout(t);
    }
  }, [toast]);
  if (!session)
    return (
      <Background className="loading-island">
        <Blank Icon={SailboatIcon}>正在驶向你的小岛…</Blank>
      </Background>
    );
  const protectedPage = modules.some(
    (m) => m.id === pageID && m.id !== "tools",
  );
  return (
    <Background type="default" className="island-background">
      <div className="island-shell">
        <header className="island-header">
          <a href="/" className="brand">
            <span className="brand-leaf">
              <LeafIcon size={37} />
            </span>
            <span>
              <strong>栖站</strong>
              <small>MY LITTLE AI ISLAND</small>
            </span>
          </a>
          <nav className="desktop-shortcuts">
            <a href="/" aria-current={pageID === "home" ? "page" : undefined}>
              岛屿首页
            </a>
            <a href="/chat/">开始聊天</a>
            <a href="/lab/">寻找灵感</a>
          </nav>
          <div className="header-actions">
            <Tag color="app-green" size="small">
              {session.authenticated ? "岛民已归来" : "欢迎来做客"}
            </Tag>
            <Button
              id="account"
              size="small"
              icon={
                session.authenticated ? (
                  <HomeIcon size={18} />
                ) : (
                  <LockIcon size={18} />
                )
              }
              onClick={async () => {
                if (session.authenticated) {
                  await api("logout", { method: "POST", body: {} });
                  setSession({ ...session, authenticated: false });
                  go("/");
                } else go("/portal-login/");
              }}
            >
              {session.authenticated ? "退出登录" : "登录小岛"}
            </Button>
          </div>
        </header>
        {pageID !== "home" && (
          <nav className="module-nav" aria-label="功能导航">
            <Button
              size="small"
              type="text"
              icon={<HomeIcon size={19} />}
              onClick={() => go("/")}
            >
              首页
            </Button>
            {modules.map((m) => (
              <Button
                key={m.id}
                size="small"
                type={pageID === m.id ? "primary" : "text"}
                icon={<m.Icon size={19} />}
                onClick={() => go("/" + m.id + "/")}
              >
                {m.title}
              </Button>
            ))}
          </nav>
        )}
        <main>
          {pageID === "portal-login" ||
          (protectedPage && !session.authenticated) ? (
            <Login />
          ) : pageID === "home" ? (
            <Home session={session} />
          ) : pageID === "tools" ? (
            <Tools />
          ) : pageID === "chat" ? (
            <Chat session={session} />
          ) : pageID === "read" || pageID === "lab" ? (
            <Studio key={pageID} kind={pageID} session={session} />
          ) : pageID === "status" ? (
            <Status />
          ) : pageID === "quota" ? (
            <Quota />
          ) : (
            <Home session={session} />
          )}
        </main>
        <Divider type="ocean-wave" />
        <div className="footer-links">
          <a href="/admin/dashboard">
            <SettingsIcon size={17} /> Sub2API 管理后台
          </a>
          <a href="/dashboard">
            <HomeIcon size={17} /> Sub2API 用户中心
          </a>
          <a
            href="https://github.com/motoneko/personal-ai-portal"
            target="_blank"
            rel="noreferrer"
          >
            开源仓库
          </a>
        </div>
        <Footer text="栖站 · 留一点时间，做喜欢的事。" />
      </div>
      {toast && (
        <div className="toast" role="status">
          <Card pattern="app-yellow">
            <FlowerIcon size={24} />
            {toast}
          </Card>
        </div>
      )}
    </Background>
  );
}
function Island() {
  return (
    <div className="island-scene" aria-hidden="true">
      <div className="scene-sun">
        <SunIcon size={66} />
      </div>
      <div className="scene-cloud cloud-one">
        <CloudIcon size={80} />
      </div>
      <div className="scene-cloud cloud-two">
        <CloudIcon size={55} />
      </div>
      <div className="island-sea"></div>
      <div className="island-land"></div>
      <div className="scene-tree">
        <TreeIcon size={130} />
      </div>
      <div className="scene-home">
        <HomeIcon size={116} />
      </div>
      <div className="scene-flower">
        <FlowerIcon size={42} />
      </div>
      <div className="scene-flower second">
        <FlowerIcon size={31} />
      </div>
      <div className="scene-boat">
        <SailboatIcon size={58} />
      </div>
      <div className="scene-label">
        <Tag color="app-teal" variant="solid">
          <LeafIcon size={16} /> YOUR HAPPY PLACE
        </Tag>
      </div>
    </div>
  );
}
function Home({ session }) {
  const [health, setHealth] = useState(null),
    [quota, setQuota] = useState(null);
  useEffect(() => {
    if (session.authenticated) {
      api("status")
        .then(setHealth)
        .catch(() => {});
      api("quota")
        .then(setQuota)
        .catch(() => {});
    }
  }, [session.authenticated]);
  return (
    <>
      <section className="welcome">
        <div className="welcome-copy">
          <Title color="app-yellow" size="small" variant="ribbon">
            欢迎回到你的小岛
          </Title>
          <h1>
            今天，也来岛上
            <br />
            做点<span>有趣的事。</span>
          </h1>
          <p>
            和 AI 聊天，收藏知识，种下灵感。
            <br />
            这里是你的私人小天地，慢慢来就好。
          </p>
          <div className="hero-buttons">
            <Button
              type="primary"
              size="large"
              icon={<CompassIcon size={24} />}
              onClick={() =>
                document
                  .getElementById("explore")
                  .scrollIntoView({ behavior: "smooth" })
              }
            >
              开始探索
            </Button>
            <Button
              type="text"
              icon={<CoffeeIcon size={23} />}
              onClick={() => go("/chat/")}
            >
              找 AI 聊一会儿
            </Button>
          </div>
        </div>
        <Island />
      </section>
      <section className="island-strip">
        <div className="strip-greeting">
          <FlowerIcon size={36} />
          <div>
            <strong>岛上今日简报</strong>
            <small>一切准备就绪，等你来探索</small>
          </div>
        </div>
        <div>
          <span className="strip-label">小岛设施</span>
          <strong>
            6 <small>处好去处</small>
          </strong>
        </div>
        <div>
          <span className="strip-label">服务状态</span>
          <strong id="home-health">
            {!session.authenticated
              ? "登录后查看"
              : !health
                ? "检查中"
                : health.services.every((s) => s.ok)
                  ? "运行正常"
                  : "需要关注"}
          </strong>
        </div>
        <div>
          <span className="strip-label">能量账户</span>
          <strong id="home-quota">
            {!session.authenticated
              ? "私人保管"
              : quota
                ? quota.accounts.length + " 个账号"
                : "读取中"}
          </strong>
        </div>
        <div className="strip-date">
          <SunIcon size={25} />
          <span>
            {new Date().toLocaleDateString("zh-CN", {
              month: "long",
              day: "numeric",
              weekday: "short",
            })}
          </span>
        </div>
      </section>
      <section id="explore">
        <div className="section-heading">
          <div>
            <span className="eyebrow">EXPLORE YOUR ISLAND</span>
            <h2>
              今天，想去哪里？ <LeafIcon size={26} />
            </h2>
          </div>
          <span>六个小角落，装下你的好奇心</span>
        </div>
        <div className="cards">
          {modules.map((m, i) => (
            <a className="destination" key={m.id} href={"/" + m.id + "/"}>
              <Card pattern={m.color} hoverable className="destination-card">
                <div className="destination-top">
                  <span className="destination-icon">
                    <m.Icon size={56} />
                  </span>
                  <Tag color={m.color} size="small">
                    0{i + 1} · {m.short}
                  </Tag>
                </div>
                <h3>{m.title}</h3>
                <p>{m.desc}</p>
                <div className="destination-bottom">
                  <span>{m.hint}</span>
                  <ArrowRightIcon size={25} />
                </div>
              </Card>
            </a>
          ))}
        </div>
      </section>
      <section className="home-bottom">
        <Card type="dashed" className="notice-board">
          <Title color="app-green" size="small" variant="tab">
            小岛便签
          </Title>
          <h3>灵感有时，只差一个开始。</h3>
          <p>
            今天读到的好文章，交给图书馆整理。
            <br />
            突然冒出的奇妙念头，去花园里种下它。
          </p>
          <Button
            type="text"
            icon={<SparklesIcon size={23} />}
            onClick={() => go("/lab/")}
          >
            去灵感花园逛逛
          </Button>
          <div className="board-flower">
            <FlowerIcon size={76} />
          </div>
        </Card>
        <Card pattern="app-yellow" className="quick-dock">
          <Title color="app-orange" size="small" variant="ribbon">
            岛务小站
          </Title>
          <div className="quick-row">
            <a href="/admin/dashboard">
              <SettingsIcon size={28} />
              <span>
                Sub2API 管理后台<small>账号、模型与分组管理</small>
              </span>
              <ArrowRightIcon size={20} />
            </a>
            <a href="/dashboard">
              <HomeIcon size={28} />
              <span>
                Sub2API 用户中心<small>用量与 API 密钥</small>
              </span>
              <ArrowRightIcon size={20} />
            </a>
          </div>
        </Card>
      </section>
    </>
  );
}
function Login() {
  const [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("login", { method: "POST", body: { password } });
      go(pageID === "portal-login" ? "/" : location.pathname);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }
  return (
    <div className="login-wrap">
      <Card pattern="app-teal" className="login-art">
        <HomeIcon size={130} />
        <Title color="app-yellow" variant="ribbon">
          欢迎回家，岛主
        </Title>
        <p>
          聊天、收藏与小岛的秘密，
          <br />
          都在这里等你回来。
        </p>
        <FlowerIcon size={45} />
      </Card>
      <Card className="login-card">
        <Tag color="app-teal">PRIVATE ISLAND</Tag>
        <h1>打开你的小岛</h1>
        <p>输入空间密码，继续你的探索。</p>
        <form id="login-form" onSubmit={submit}>
          <Label htmlFor="password">空间密码</Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            minLength={10}
            required
            size="large"
            prefix={<LockIcon size={22} />}
            placeholder="只有你知道的登岛口令"
          />
          <Button
            htmlType="submit"
            type="primary"
            block
            size="large"
            loading={busy}
            icon={<ArrowRightIcon size={22} />}
          >
            解锁小岛
          </Button>
          {error && (
            <div id="login-error" role="alert" className="error-text">
              {error}
            </div>
          )}
        </form>
        <p className="muted">
          只是来逛逛？<a href="/tools/">工具铺无需登录</a>。
        </p>
      </Card>
    </div>
  );
}
function ModelPicker({ session, value, onChange, disabled }) {
  const [models, setModels] = useState([session.model]);
  useEffect(() => {
    api("models")
      .then((d) =>
        setModels([
          ...new Set([session.model, ...(d.data || []).map((x) => x.id)]),
        ]),
      )
      .catch((e) => inform(e.message));
  }, [session.model]);
  return (
    <div className="model-picker" id="model">
      <Label>选择你的 AI 伙伴</Label>
      <Select
        aria-label="选择模型"
        value={value}
        onChange={onChange}
        options={models.map((id) => ({ key: id, label: id }))}
        showSearch
        disabled={disabled}
      />
    </div>
  );
}
function useRecords(kind) {
  const [items, setItems] = useState([]);
  const refresh = () =>
    list(kind)
      .then(setItems)
      .catch((e) => inform(e.message));
  useEffect(() => {
    refresh();
  }, [kind]);
  return [items, refresh];
}
function History({ items, onSelect, active, kind }) {
  return (
    <div className="history-list">
      {items.length ? (
        items.map((r) => (
          <Button
            key={r.id}
            className="history-item"
            size="small"
            type={active === r.id ? "primary" : "text"}
            data-chat={kind === "chat" ? r.id : undefined}
            data-record={kind !== "chat" ? r.id : undefined}
            onClick={() => onSelect(r)}
            icon={<BookmarkIcon size={17} />}
          >
            {r.title || "未命名记录"}
          </Button>
        ))
      ) : (
        <p className="muted">
          回忆还在路上，
          <br />
          从第一次探索开始吧。
        </p>
      )}
    </div>
  );
}
function Chat({ session }) {
  const [items, refresh] = useRecords("chat"),
    [prompts, refreshPrompts] = useRecords("prompt"),
    [chat, setChat] = useState({ id: "", messages: [] }),
    [text, setText] = useState(""),
    [model, setModel] = useState(session.model),
    [busy, setBusy] = useState(false),
    [deleting, setDeleting] = useState(null);
  const messagesRef = useRef();
  useEffect(() => {
    messagesRef.current?.scrollTo(0, messagesRef.current.scrollHeight);
  }, [chat.messages, busy]);
  async function send(e) {
    e.preventDefault();
    if (busy || !text.trim()) return;
    const prompt = text.trim(),
      history = chat.messages;
    setText("");
    setBusy(true);
    setChat({
      ...chat,
      messages: [...history, { role: "user", content: prompt }],
    });
    try {
      const d = await api("generate", {
        method: "POST",
        body: { model, mode: "chat", prompt, history },
      });
      const next = {
        ...chat,
        messages: [
          ...history,
          { role: "user", content: prompt },
          { role: "assistant", content: d.text },
        ],
      };
      setChat(next);
      try {
        const r = await save(
          "chat",
          next.messages[0].content.slice(0, 40),
          next,
          chat.id,
        );
        setChat({ ...next, id: r.id });
        refresh();
      } catch (e) {
        inform("回复已生成，但保存失败：" + e.message);
      }
    } catch (e) {
      setChat({ ...chat, messages: history });
      setText(prompt);
      inform(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeader
        action={
          <Button
            icon={<PlusIcon size={20} />}
            disabled={busy}
            id="new-chat"
            onClick={() => {
              setChat({ id: "", messages: [] });
              setText("");
            }}
          >
            新对话
          </Button>
        }
      />
      {!session.aiConfigured && <Message>请先在服务器配置模型密钥。</Message>}
      <div className="workspace">
        <Card className="history">
          <Title size="small" color="app-yellow" variant="tab">
            我的聊天手帐
          </Title>
          <History
            items={items}
            onSelect={(r) => {
              if (!busy) setChat({ ...JSON.parse(r.body), id: r.id });
            }}
            active={chat.id}
            kind="chat"
          />
          <Divider type="hairline" />
          <h3>口袋提示词</h3>
          {prompts.map((r) => (
            <div className="prompt-row" key={r.id}>
              <Button
                type="text"
                size="small"
                data-prompt={r.id}
                onClick={() => setText(JSON.parse(r.body).text)}
              >
                {r.title}
              </Button>
              <Button
                type="text"
                size="small"
                danger
                aria-label="删除提示词"
                onClick={() => setDeleting({ ...r, isPrompt: true })}
                icon={<TrashIcon size={16} />}
              />
            </div>
          ))}
          <Button
            id="save-prompt"
            size="small"
            type="dashed"
            icon={<BookmarkIcon size={18} />}
            onClick={async () => {
              if (!text.trim()) return inform("先写下想收藏的提示词");
              try {
                await save("prompt", text.slice(0, 40), { text });
                refreshPrompts();
                inform("提示词已收藏");
              } catch (e) {
                inform(e.message);
              }
            }}
          >
            收藏当前提示词
          </Button>
        </Card>
        <Card className="chat-room">
          <div className="row spread">
            <ModelPicker
              session={session}
              value={model}
              onChange={setModel}
              disabled={busy}
            />
            <Button
              id="delete-chat"
              size="small"
              type="text"
              danger
              disabled={!chat.id || busy}
              icon={<TrashIcon size={19} />}
              onClick={() => setDeleting(chat)}
            >
              删除对话
            </Button>
          </div>
          <div id="messages" className="messages" ref={messagesRef}>
            {!chat.messages.length ? (
              <Blank Icon={ChatIcon}>
                坐下来，聊聊今天的想法。
                <br />
                一个好问题，就是一次好探索。
              </Blank>
            ) : (
              chat.messages.map((m, i) => (
                <div key={i} className={"bubble " + m.role}>
                  <Avatar
                    size={30}
                    icon={m.role === "user" ? <HomeIcon /> : <LeafIcon />}
                  />
                  <div>
                    <small>{m.role === "user" ? "岛主" : "AI 伙伴"}</small>
                    <div>{m.content}</div>
                  </div>
                </div>
              ))
            )}
            {busy && <Message>AI 正在整理思绪，请稍等一会儿…</Message>}
          </div>
          <form id="chat-form" onSubmit={send}>
            <Label htmlFor="chat-input">想说点什么？</Label>
            <textarea
              id="chat-input"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (
                  e.key === "Enter" &&
                  !e.shiftKey &&
                  !e.nativeEvent.isComposing
                ) {
                  e.preventDefault();
                  e.currentTarget.form.requestSubmit();
                }
              }}
              placeholder="把问题、想法或一声问候留在这里…"
              required
            />
            <div className="row spread">
              <small className="muted">
                回复后自动保存 · Shift + Enter 换行
              </small>
              <Button
                htmlType="submit"
                id="send"
                type="primary"
                loading={busy}
                icon={<SendIcon size={21} />}
              >
                发送消息
              </Button>
            </div>
          </form>
        </Card>
      </div>
      <Confirm
        record={deleting}
        onClose={() => setDeleting(null)}
        onDone={() => {
          if (deleting?.isPrompt) refreshPrompts();
          else {
            setChat({ id: "", messages: [] });
            refresh();
          }
        }}
      />
    </>
  );
}
function Tools() {
  const [json, setJSON] = useState(""),
    [jsonOut, setJSONOut] = useState(""),
    [stamp, setStamp] = useState(""),
    [stampOut, setStampOut] = useState(""),
    [a, setA] = useState(""),
    [b, setB] = useState(""),
    [diff, setDiff] = useState([]),
    [qr, setQR] = useState(""),
    [hasQR, setHasQR] = useState(false);
  const canvas = useRef();
  function format(min) {
    try {
      setJSONOut(JSON.stringify(JSON.parse(json), null, min ? 0 : 2));
    } catch (e) {
      setJSONOut("JSON 语法错误：" + e.message);
    }
  }
  function convert(value = stamp) {
    const s = value.trim();
    const d = /^\d+$/.test(s)
      ? new Date(Number(s) * (s.length <= 10 ? 1000 : 1))
      : new Date(s);
    setStampOut(
      Number.isNaN(d.getTime())
        ? "无法识别该日期，请使用 ISO 日期或 Unix 时间戳。"
        : `本地时间：${d.toLocaleString()}\nUTC：${d.toISOString()}\n秒：${Math.floor(d.getTime() / 1000)}\n毫秒：${d.getTime()}`,
    );
  }
  return (
    <>
      <PageHeader />
      <Message>在你的浏览器里悄悄完成。输入内容不会上传到服务器。</Message>
      <div className="tool-grid">
        <Card className="tool-card">
          <Title size="small" color="app-teal" variant="tab">
            JSON 整理盒
          </Title>
          <Label htmlFor="json-input">放入 JSON 内容</Label>
          <textarea
            id="json-input"
            value={json}
            onChange={(e) => setJSON(e.target.value)}
            placeholder='{"hello": "island"}'
          />
          <div className="row">
            <Button
              id="json-format"
              type="primary"
              onClick={() => format(false)}
            >
              格式化
            </Button>
            <Button id="json-min" onClick={() => format(true)}>
              压缩
            </Button>
            <Button
              id="json-copy"
              icon={<CopyIcon size={18} />}
              onClick={() => copy(jsonOut)}
            >
              复制
            </Button>
          </div>
          <div id="json-output" className="output">
            {jsonOut || "整齐的结果会出现在这里"}
          </div>
        </Card>
        <Card className="tool-card">
          <Title size="small" color="app-yellow" variant="tab">
            时间转换钟
          </Title>
          <Label htmlFor="timestamp">Unix 时间戳或日期</Label>
          <Input
            id="timestamp"
            value={stamp}
            onChange={(e) => setStamp(e.target.value)}
            placeholder="例如 1794960000 或 ISO 日期"
          />
          <div className="row">
            <Button id="time-convert" type="primary" onClick={() => convert()}>
              转换
            </Button>
            <Button
              id="time-now"
              onClick={() => {
                const s = String(Date.now());
                setStamp(s);
                convert(s);
              }}
            >
              此时此刻
            </Button>
          </div>
          <div id="time-output" className="output">
            {stampOut || "支持秒、毫秒、本地时间和 UTC 互转"}
          </div>
          <div className="clock-corner">
            <Time locale="zh-cn" />
          </div>
        </Card>
        <Card className="tool-card">
          <Title size="small" color="app-green" variant="tab">
            文本找不同
          </Title>
          <Label htmlFor="diff-a">原始内容</Label>
          <textarea
            id="diff-a"
            value={a}
            onChange={(e) => setA(e.target.value)}
            placeholder="原来的文字…"
          />
          <Label htmlFor="diff-b">修改后内容</Label>
          <textarea
            id="diff-b"
            value={b}
            onChange={(e) => setB(e.target.value)}
            placeholder="修改后的文字…"
          />
          <Button
            id="diff-run"
            type="primary"
            onClick={() => {
              if (a.length + b.length > 100000)
                return inform("文本总长度请控制在 10 万字符以内");
              const d = diffLines(a, b, { timeout: 1000 });
              if (!d) return inform("差异太复杂，请缩短文本");
              setDiff(d);
            }}
          >
            找找变化
          </Button>
          <div id="diff-output" className="output">
            {diff.length
              ? diff.map((p, i) => (
                  <span
                    key={i}
                    className={
                      p.added ? "diff-add" : p.removed ? "diff-remove" : ""
                    }
                  >
                    {p.value}
                  </span>
                ))
              : "绿色为新增，红色为删除"}
          </div>
        </Card>
        <Card className="tool-card">
          <Title size="small" color="app-pink" variant="tab">
            二维码邮局
          </Title>
          <Label htmlFor="qr-input">寄送一个网址或一段话</Label>
          <textarea
            id="qr-input"
            value={qr}
            onChange={(e) => setQR(e.target.value)}
            placeholder="想把什么装进二维码？"
          />
          <div className="row">
            <Button
              id="qr-run"
              type="primary"
              onClick={async () => {
                try {
                  await QRCode.toCanvas(canvas.current, qr, {
                    width: 240,
                    margin: 2,
                  });
                  setHasQR(true);
                } catch {
                  inform("请输入有效内容，长文本可能超出容量");
                }
              }}
            >
              生成二维码
            </Button>
            <Button
              id="qr-download"
              icon={<DownloadIcon size={19} />}
              onClick={() =>
                hasQR
                  ? download(canvas.current.toDataURL(), "qrcode.png")
                  : inform("请先生成二维码")
              }
            >
              下载
            </Button>
          </div>
          <canvas id="qr-canvas" ref={canvas} />
          <p className="muted">纯本地生成，让小秘密留在小岛里。</p>
        </Card>
      </div>
    </>
  );
}
function Preview({ text }) {
  const [url, setURL] = useState("");
  useEffect(() => {
    const restriction = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'">`;
    const u = URL.createObjectURL(
      new Blob([restriction + stripHTML(text)], { type: "text/html" }),
    );
    setURL(u);
    return () => URL.revokeObjectURL(u);
  }, [text]);
  return (
    <iframe
      title="隔离的网页作品预览"
      className="preview"
      sandbox="allow-scripts"
      src={url}
    />
  );
}
function Studio({ kind, session }) {
  const read = kind === "read";
  const [items, refresh] = useRecords(kind),
    [current, setCurrent] = useState(null),
    [source, setSource] = useState(""),
    [mode, setMode] = useState(read ? "summary" : "story"),
    [model, setModel] = useState(session.model),
    [result, setResult] = useState(""),
    [images, setImages] = useState([]),
    [busy, setBusy] = useState(false),
    [deleting, setDeleting] = useState(null);
  const options = (
    read
      ? [
          ["summary", "文章摘要"],
          ["translate", "全文翻译"],
          ["insights", "观点与证据"],
        ]
      : [
          ["story", "短篇故事"],
          ["copy", "创意文案"],
          ["web", "网页小作品"],
          ["image", "AI 图片"],
        ]
  ).map(([key, label]) => ({ key, label }));
  function fresh() {
    setCurrent(null);
    setSource("");
    setResult("");
    setImages([]);
  }
  async function generate() {
    if (!source.trim()) return inform("先放入一点内容吧");
    setBusy(true);
    try {
      const d = await api("generate", {
        method: "POST",
        body: { model, mode, prompt: source },
      });
      setResult(d.text || "");
      setImages(d.images || []);
      inform("完成啦，记得收藏你的收获");
    } catch (e) {
      inform(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeader
        action={
          <Button
            id="new-record"
            icon={<PlusIcon size={20} />}
            disabled={busy}
            onClick={fresh}
          >
            新建{read ? "阅读" : "作品"}
          </Button>
        }
      />
      {!session.aiConfigured && <Message>请先在服务器配置模型密钥。</Message>}
      <div className="workspace">
        <Card className="history">
          <Title
            size="small"
            color={read ? "app-green" : "app-pink"}
            variant="tab"
          >
            {read ? "我的阅读书架" : "我的灵感手帐"}
          </Title>
          <History
            items={items}
            active={current?.id}
            kind={kind}
            onSelect={(r) => {
              if (busy) return;
              try {
                const d = JSON.parse(r.body);
                setCurrent(r);
                setSource(d.source);
                setMode(d.mode);
                setResult(d.text || "");
                setImages(d.images || []);
              } catch {
                inform("记录格式无法识别");
              }
            }}
          />
        </Card>
        <Card className="studio">
          <div className="row spread">
            <ModelPicker
              session={session}
              value={model}
              onChange={setModel}
              disabled={busy}
            />
            <div className="mode-picker" id="mode">
              <Label>{read ? "阅读方式" : "创作方向"}</Label>
              <Select
                aria-label="选择生成方式"
                options={options}
                value={mode}
                onChange={setMode}
                disabled={busy}
              />
            </div>
          </div>
          <Label htmlFor="source">
            {read ? "在这里放下文章" : "种下你的想法"}
          </Label>
          <textarea
            id="source"
            rows={9}
            value={source}
            onChange={(e) => setSource(e.target.value)}
            disabled={busy}
            placeholder={
              read
                ? "粘贴文章，读出新的收获…"
                : "一个故事、一页小网页，或一张脑海里的画面…"
            }
          />
          <div className="row spread">
            <small className="muted">
              {mode === "image"
                ? "图片能力与额度由上游分组决定"
                : "生成完成后，可收藏到你的手帐"}
            </small>
            <Button
              id="generate"
              type="primary"
              loading={busy}
              icon={
                read ? <BookOpenIcon size={22} /> : <SparklesIcon size={22} />
              }
              onClick={generate}
            >
              {read ? "开始阅读" : "让灵感发芽"}
            </Button>
          </div>
          <div id="studio-result">
            {busy ? (
              <Message>正在认真创作，可能需要一到三分钟…</Message>
            ) : result ? (
              <>
                <div className="output">{result}</div>
                {mode === "web" && <Preview text={result} />}
              </>
            ) : !images.length ? (
              <Blank Icon={read ? BookOpenIcon : FlowerIcon}>
                {read
                  ? "你的阅读收获，会在这里慢慢展开。"
                  : "每个奇妙的作品，都始于一个小念头。"}
              </Blank>
            ) : null}
            {images.map((im, i) => {
              const src = im.b64_json
                ? "data:image/png;base64," + im.b64_json
                : im.url;
              return src &&
                /^(https:\/\/|data:image\/|\/portal-api\/image\/)/.test(src) ? (
                <img
                  key={i}
                  className="image-output"
                  src={src}
                  alt="AI 生成作品"
                  referrerPolicy="no-referrer"
                />
              ) : null;
            })}
          </div>
          <Divider type="hairline" />
          <div className="row">
            <Button
              id="save-record"
              disabled={busy}
              icon={<BookmarkIcon size={20} />}
              onClick={async () => {
                if (!result && !images.length)
                  return inform("先生成一份作品吧");
                try {
                  const r = await save(
                    kind,
                    source.slice(0, 40),
                    { source, mode, text: result, images },
                    current?.id || "",
                  );
                  setCurrent(r);
                  refresh();
                  inform("已放进你的收藏");
                } catch (e) {
                  inform(e.message);
                }
              }}
            >
              收藏{read ? "阅读" : "作品"}
            </Button>
            <Button
              id="copy-result"
              icon={<CopyIcon size={19} />}
              onClick={() =>
                result ? copy(result) : inform("暂无可复制的文本")
              }
            >
              复制
            </Button>
            <Button
              id="download-result"
              icon={<DownloadIcon size={19} />}
              onClick={() => {
                if (result)
                  downloadText(
                    mode === "web" ? stripHTML(result) : result,
                    mode === "web" ? "creation.html" : "result.txt",
                  );
                else if (images[0]?.url?.startsWith("/portal-api/"))
                  download(images[0].url, "creation.png");
                else if (images[0]?.b64_json)
                  download(
                    "data:image/png;base64," + images[0].b64_json,
                    "creation.png",
                  );
                else inform("暂无可下载的内容");
              }}
            >
              下载
            </Button>
            <Button
              id="delete-record"
              danger
              type="text"
              disabled={!current || busy}
              icon={<TrashIcon size={19} />}
              onClick={() => setDeleting(current)}
            >
              删除
            </Button>
          </div>
        </Card>
      </div>
      <Confirm
        record={deleting}
        onClose={() => setDeleting(null)}
        onDone={() => {
          fresh();
          refresh();
        }}
      />
    </>
  );
}
function Status() {
  const [data, setData] = useState(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function refresh() {
    setBusy(true);
    setError("");
    try {
      setData(await api("status"));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    refresh();
  }, []);
  const mem = data?.memory;
  return (
    <>
      <PageHeader
        action={
          <Button
            id="refresh"
            icon={<RefreshIcon size={21} />}
            onClick={refresh}
            loading={busy}
          >
            刷新状态
          </Button>
        }
      />
      {error && <Message>{error}</Message>}
      {!data ? (
        <Blank Icon={ActivityIcon}>正在聆听小岛的脉搏…</Blank>
      ) : (
        <>
          <div className="stats-grid">
            <Card pattern="app-teal">
              <Tag color="app-teal">内存占用</Tag>
              <h2>
                {mem
                  ? Math.round((1 - mem.MemAvailable / mem.MemTotal) * 100) +
                    "%"
                  : "未采集"}
              </h2>
              {mem && (
                <Progress
                  percent={Math.round(
                    (1 - mem.MemAvailable / mem.MemTotal) * 100,
                  )}
                  showInfo={false}
                />
              )}
              <p>
                {mem
                  ? `${bytes(mem.MemTotal - mem.MemAvailable)} / ${bytes(mem.MemTotal)}`
                  : "未挂载主机指标"}
              </p>
            </Card>
            <Card pattern="app-yellow">
              <Tag color="app-orange">系统负载</Tag>
              <h2>{data.load?.join(" / ") || "未采集"}</h2>
              <p>1 / 5 / 15 分钟平均负载</p>
            </Card>
            <Card pattern="app-green">
              <Tag color="app-green">连续运行</Tag>
              <h2>
                {data.uptimeSeconds
                  ? Math.floor(data.uptimeSeconds / 86400) + " 天"
                  : "未采集"}
              </h2>
              <p>小岛一直在，等你随时回来</p>
            </Card>
          </div>
          <div className="status-bottom">
            <Card className="service-card">
              <Title size="small" color="app-blue" variant="tab">
                服务健康
              </Title>
              {data.services.map((s) => (
                <div className="status-item" key={s.name}>
                  <span>
                    <ActivityIcon size={23} />
                    {s.name}
                  </span>
                  <Tag color={s.ok ? "app-green" : "app-red"}>
                    {s.ok ? "在线" : "异常"} · {s.latencyMs} ms
                  </Tag>
                </div>
              ))}
              <p className="muted">
                健康接口延迟，不代表模型生成速度。
                <br />
                最近更新：{date(data.time)}
              </p>
            </Card>
            {data.disk && (
              <Card className="service-card">
                <Title size="small" color="app-yellow" variant="tab">
                  小岛储物空间
                </Title>
                <h2>
                  {bytes(data.disk.used)}{" "}
                  <small>/ {bytes(data.disk.total)}</small>
                </h2>
                <Progress
                  percent={Math.round((data.disk.used / data.disk.total) * 100)}
                />
                <p>还可存放 {bytes(data.disk.available)}</p>
                <small className="muted">个人站数据卷所在的文件系统</small>
              </Card>
            )}
          </div>
        </>
      )}
    </>
  );
}
function QuotaLine({ label, value, reset }) {
  return (
    <div className="quota-line">
      <div className="row spread">
        <span>{label}</span>
        <strong>
          {value == null ? "未上报" : Number(value).toFixed(1) + "% 剩余"}
        </strong>
      </div>
      {value != null && (
        <Progress
          percent={Math.max(0, Math.min(100, Number(value)))}
          showInfo={false}
        />
      )}
      <small className="muted">
        {reset ? "重置于 " + date(reset) : "暂无重置时间"}
      </small>
    </div>
  );
}
function Quota() {
  const [data, setData] = useState(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function refresh() {
    setBusy(true);
    setError("");
    try {
      setData(await api("quota"));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    refresh();
  }, []);
  return (
    <>
      <PageHeader
        action={
          <Button
            id="refresh"
            icon={<RefreshIcon size={21} />}
            loading={busy}
            onClick={refresh}
          >
            补给情报更新
          </Button>
        }
      />
      {error && <Message>{error}</Message>}
      {!data ? (
        <Blank Icon={WalletIcon}>正在清点你的能量补给…</Blank>
      ) : (
        <>
          <Message>
            共 {data.accounts.length} 个账号，数据来自现有额度服务。最近更新：
            {date(data.generatedAt)}
          </Message>
          <div className="quota-grid">
            {data.accounts.map((a, i) => (
              <Card className="quota-card" key={a.id}>
                <div className="row spread">
                  <Avatar size={48} icon={<WalletIcon size={30} />} />
                  <Tag
                    color={a.status === "active" ? "app-green" : "app-orange"}
                  >
                    {a.platform} · {a.status}
                  </Tag>
                </div>
                <h2>{a.name}</h2>
                <QuotaLine
                  label="5 小时能量"
                  value={a.fiveHourRemaining}
                  reset={a.fiveHourResetAt}
                />
                <QuotaLine
                  label="7 天能量"
                  value={a.sevenDayRemaining}
                  reset={a.sevenDayResetAt}
                />
                <Divider type="hairline" />
                <small className="muted">
                  最近同步：{date(a.usageUpdatedAt)}
                </small>
              </Card>
            ))}
          </div>
          {!data.accounts.length && (
            <Blank Icon={WalletIcon}>还没有账号额度数据</Blank>
          )}
        </>
      )}
    </>
  );
}
createRoot(document.getElementById("app")).render(<App />);
