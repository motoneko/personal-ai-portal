import { chromium } from "playwright";
import assert from "node:assert/strict";
const base = process.env.PORTAL_TEST_URL || "http://127.0.0.1:8090";
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH,
  args: ["--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
await page.addInitScript(() => {
  delete window.showOpenFilePicker;
  delete window.showSaveFilePicker;
});
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error")
    console.log("Browser console:", m.text().slice(0, 300));
});
await page.goto(base + "/draw/");
await page
  .locator("#password")
  .fill(
    process.env.PORTAL_TEST_PASSWORD ||
      "preview-only-password-not-for-production",
  );
await page.locator("#login-form button").click();
const frame = page.frameLocator('iframe[title="Drawnix 白板编辑器"]');
await frame.locator(".drawnix").waitFor({ timeout: 45000 });
await frame.getByRole("button", { name: "画笔 — P", exact: true }).click();
const bounds = await page.locator("iframe").boundingBox();
await page.mouse.move(bounds.x + 400, bounds.y + 300);
await page.mouse.down();
await page.mouse.move(bounds.x + 550, bounds.y + 430, { steps: 12 });
await page.mouse.up();
await frame.getByRole("status").filter({ hasText: "有未保存的修改" }).waitFor();
await page.route("**/portal-api/records", (route) =>
  route.request().method() === "POST"
    ? route.fulfill({ status: 503, json: { error: "test save failure" } })
    : route.continue(),
);
await frame.locator("#save-drawing").click();
await frame
  .getByRole("status")
  .filter({ hasText: "test save failure" })
  .waitFor();
await page.unroute("**/portal-api/records");
await frame.locator("#save-drawing").click();
await frame.getByRole("status").filter({ hasText: "已保存到小岛" }).waitFor();
const records = await page.evaluate(
  async () => await (await fetch("/portal-api/records?kind=drawing")).json(),
);
assert.ok(JSON.parse(records[0].body).children.length > 0);
await page.reload();
await frame.locator(".drawnix").waitFor();
assert.ok(
  (await frame.locator("svg.plait-board-svg").count()) ||
    (await frame.locator("svg").count()),
);
await frame.getByRole("button", { name: "应用菜单", exact: true }).click();
await frame.getByRole("button", { name: "应用菜单", exact: true }).click();
await frame.getByRole("button", { name: "更多工具", exact: true }).click();
await frame.getByText("Mermaid 到 Drawnix", { exact: true }).click();
await frame.locator("textarea").fill("flowchart TD\n A[Start] --> B[Finish]");
await frame.getByRole("button", { name: /插入/ }).click();
await frame.locator("textarea").waitFor({ state: "hidden", timeout: 5000 });
await frame.locator("#save-drawing").click();
await frame.getByRole("status").filter({ hasText: "已保存到小岛" }).waitFor();
const afterMermaid = await page.evaluate(
  async () => await (await fetch("/portal-api/records?kind=drawing")).json(),
);
assert.match(afterMermaid[0].body, /Start/);
await frame.getByRole("button", { name: "更多工具", exact: true }).click();
await frame.getByText("Markdown 到 Drawnix", { exact: true }).click();
await frame.locator("textarea").fill("# Ideas\n## First\n## Second");
await frame.getByRole("button", { name: /插入/ }).click();
await frame.locator("textarea").waitFor({ state: "hidden", timeout: 20000 });
await frame.locator("#save-drawing").click();
await frame.getByRole("status").filter({ hasText: "已保存到小岛" }).waitFor();
const afterMarkdown = await page.evaluate(
  async () => await (await fetch("/portal-api/records?kind=drawing")).json(),
);
assert.match(afterMarkdown[0].body, /Ideas/);
await page.screenshot({
  path: "test-results/drawing-desktop.png",
  fullPage: true,
});
await frame.getByRole("button", { name: "应用菜单", exact: true }).click();
const downloadPromise = page.waitForEvent("download");
await frame.getByText("保存文件", { exact: true }).click();
const download = await downloadPromise;
assert.match(download.suggestedFilename(), /\.drawnix$/);
await page.setViewportSize({ width: 390, height: 844 });
await page.screenshot({
  path: "test-results/drawing-mobile.png",
  fullPage: true,
});
assert.equal(
  await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
  false,
);
assert.equal(
  await frame
    .locator("body")
    .evaluate(() => document.documentElement.scrollWidth > innerWidth),
  false,
);
console.log(
  "PASS: Drawnix drawing, save/reload, Mermaid and Markdown conversion, export, mobile width",
);
assert.deepEqual(errors, []);
await browser.close();
