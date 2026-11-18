import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Drawnix } from "@drawnix/drawnix";
import { Button } from "animal-island-ui";
import "animal-island-ui/style";
import "../node_modules/@plait-board/react-board/index.css";
import "../node_modules/@plait-board/react-text/index.css";
import "../node_modules/@drawnix/drawnix/index.css";
import "./drawing.css";

async function request(path, options = {}) {
  const response = await fetch("/portal-api/" + path, {
    ...options,
    headers: { "Content-Type": "application/json" },
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(
      response.status === 401
        ? "登录已过期，请先导出白板，再返回首页登录。"
        : data.error || "保存失败",
    );
  return data;
}
function Drawing() {
  const [initial, setInitial] = useState(null),
    [error, setError] = useState(""),
    [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(false),
    [saved, setSaved] = useState(false);
  const value = useRef(null),
    baseline = useRef(""),
    revision = useRef(0);
  useEffect(() => {
    request("records?kind=drawing")
      .then((records) => {
        const record = records.find((r) => r.id === "drawing-main");
        const data = record ? JSON.parse(record.body) : { children: [] };
        if (!Array.isArray(data.children))
          throw new Error("白板数据格式不正确，请保留原始文件并联系管理员。");
        value.current = data;
        baseline.current = JSON.stringify(data);
        setInitial(data);
      })
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    // Navigation normally occurs in the parent page; protect unsaved work there too.
    window.parent.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("beforeunload", warn);
      window.parent.removeEventListener("beforeunload", warn);
    };
  }, [dirty]);
  async function save() {
    setBusy(true);
    setError("");
    const snapshot = JSON.stringify(value.current),
      version = revision.current;
    try {
      if (new TextEncoder().encode(snapshot).length > 1500000)
        throw new Error(
          "白板超过 1.5 MB，请用左上角菜单导出 .drawnix 文件备份，或缩小插入的图片后保存。",
        );
      await request("records", {
        method: "POST",
        body: JSON.stringify({
          id: "drawing-main",
          kind: "drawing",
          title: "我的 Drawnix 白板",
          body: snapshot,
        }),
      });
      baseline.current = snapshot;
      setSaved(true);
      setDirty(revision.current !== version);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="drawing-shell">
      <header className="drawing-savebar">
        <div>
          <strong>Drawnix 白板</strong>
          <span role="status">
            {error ||
              (dirty
                ? "有未保存的修改"
                : saved
                  ? "已保存到小岛"
                  : initial
                    ? "思维导图 · 流程图 · 自由绘画"
                    : "正在读取白板…")}
          </span>
        </div>
        <Button
          id="save-drawing"
          type="primary"
          loading={busy}
          disabled={!initial}
          onClick={save}
        >
          保存到小岛
        </Button>
      </header>
      {initial && (
        <div className="drawing-canvas">
          <Drawnix
            value={initial.children}
            viewport={initial.viewport}
            theme={initial.theme}
            onChange={(next) => {
              const data = {
                children: next.children,
                viewport: next.viewport,
                theme: next.theme,
              };
              value.current = data;
              revision.current++;
              setDirty(JSON.stringify(data) !== baseline.current);
            }}
          />
        </div>
      )}
    </div>
  );
}
createRoot(document.getElementById("drawing-app")).render(<Drawing />);
