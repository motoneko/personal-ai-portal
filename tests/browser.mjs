import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs";
const base = process.env.PORTAL_TEST_URL || "http://127.0.0.1:8090";
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined,
  args: ["--no-sandbox"],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1100 },
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(base);
await page.locator(".cards .destination").first().waitFor();
assert.equal(await page.locator(".cards .destination").count(), 4);
fs.mkdirSync("test-results", { recursive: true });
await page.screenshot({
  path: "test-results/home-desktop.png",
  fullPage: true,
});
assert.equal(await page.locator('a[href="/draw/"]').count(), 1);
assert.ok(
  (await page
    .locator(".island-shell")
    .evaluate((el) => el.getBoundingClientRect().width)) > 1400,
);
await page.goto(base + "/tools/");
await page.locator("#json-input").fill('{"test":1}');
await page.locator("#json-format").click();
assert.match(await page.locator("#json-output").innerText(), /"test": 1/);
await page.locator("#timestamp").fill("0");
await page.locator("#time-convert").click();
assert.match(await page.locator("#time-output").innerText(), /1970/);
await page.locator("#diff-a").fill("before\n");
await page.locator("#diff-b").fill("after\n");
await page.locator("#diff-run").click();
assert.equal(await page.locator(".diff-add").count(), 1);
await page.locator("#qr-input").fill("https://example.com");
await page.locator("#qr-run").click();
assert.equal(await page.locator("#qr-canvas").getAttribute("width"), "240");
await page.goto(base + "/chat/");
await page
  .locator("#password")
  .fill(
    process.env.PORTAL_TEST_PASSWORD ||
      "preview-only-password-not-for-production",
  );
await page.locator("#login-form button").click();
await page.locator("#chat-input").waitFor();
// Model calls are mocked for UI coverage; production smoke tests use the real upstream separately.
await page.route("**/portal-api/models", (r) =>
  r.fulfill({ json: { data: [{ id: "test-model" }] } }),
);
await page.route("**/portal-api/generate", (r) =>
  r.fulfill({
    json: { text: "Browser test response <script>window.XSS=true</script>" },
  }),
);
await page.locator("#chat-input").fill("browser test conversation");
await page.locator("#send").click();
await page.locator(".bubble.assistant").waitFor();
assert.equal(await page.evaluate(() => window.XSS), undefined);
await page.reload();
await page.locator("[data-chat]").first().click();
assert.match(
  await page.locator("#messages").innerText(),
  /Browser test response/,
);
await page.locator("#chat-input").fill("my saved prompt");
await page.locator("#save-prompt").click();
await page.locator("[data-prompt]").first().waitFor();
await page.goto(base + "/read/");
await page.locator("#source").fill("A test article about software.");
await page.locator("#generate").click();
await page.waitForFunction(() =>
  document.querySelector("#studio-result").textContent.includes("Browser test"),
);
await page.locator("#save-record").click();
await page.locator("[data-record]").first().waitFor();
await page.goto(base + "/lab/");
await page.getByRole("combobox", { name: "选择生成方式" }).click();
await page.getByRole("option", { name: "网页小作品" }).click();
await page.locator("#source").fill("a webpage");
await page.locator("#generate").click();
await page.locator('iframe[sandbox="allow-scripts"]').waitFor();
await page.route("**/portal-api/status", (r) =>
  r.fulfill({
    json: {
      time: new Date().toISOString(),
      services: [{ name: "Sub2API", ok: true, latencyMs: 3 }],
      load: ["0.1", "0.2", "0.3"],
      memory: { MemTotal: 1000000000, MemAvailable: 500000000 },
      uptimeSeconds: 86400,
      disk: { total: 40000000000, used: 10000000000, available: 30000000000 },
    },
  }),
);
await page.goto(base + "/status/");
await page.locator(".status-item").waitFor();
await page.route("**/portal-api/quota", (r) =>
  r.fulfill({
    json: {
      accounts: [
        {
          id: 1,
          name: "Test account",
          platform: "openai",
          status: "active",
          fiveHourRemaining: 75,
          sevenDayRemaining: 60,
        },
      ],
      generatedAt: new Date().toISOString(),
    },
  }),
);
await page.goto(base + "/quota/");
await page.locator(".quota-card").waitFor();
assert.match(await page.locator(".quota-card").innerText(), /75.0%/);
await page.setViewportSize({ width: 390, height: 844 });
await page.goto(base);
await page.locator(".cards").waitFor();
assert.equal(
  await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
  false,
);
await page.screenshot({ path: "test-results/home-mobile.png", fullPage: true });
await page.locator("#account").click();
await page.goto(base + "/quota/");
await page.locator("#password").waitFor();
assert.deepEqual(errors, []);
console.log(
  "PASS: home, mobile, tools, login/logout, chat persistence, prompts, reading, sandbox preview, status, quota, XSS text escaping",
);
await browser.close();
