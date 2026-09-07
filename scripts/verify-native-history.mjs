/* global console, process, window, document, fetch */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { URL } from "node:url";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

// Isolated contract-test data; never a production provider or application fallback.
const endpoint = "http://127.0.0.1:19431/api/v1";
if (process.argv.includes("--server")) {
  let conversations = [false, true].map((archived) => ({
    id: archived ? "qa-archived" : "qa-current", archived, pinned: false,
    title: archived ? "QA arşiv sohbeti" : "QA görünür sohbet",
    updatedAt: "2026-09-07T10:00:00Z",
    turns: [{ id: "qa-turn", from: "user", text: "Yerel silme regresyon testi", timestamp: "12:00" }],
  }));
  let failNextClear = true;
  const calls = [];
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, endpoint);
    response.setHeader("Content-Type", "application/json");
    if (url.pathname === "/test/state") {
      response.end(JSON.stringify({ conversations, calls })); return;
    }
    if (url.pathname.endsWith("/health")) { response.end('{"ok":true}'); return; }
    if (url.pathname.endsWith("/installations")) {
      response.statusCode = 503;
      response.end('{"error":{"message":"Test requires an existing native installation; credential creation is disabled."}}'); return;
    }
    calls.push({ method: request.method, path: url.pathname, all: url.searchParams.get("all") });
    if (request.method === "GET") { response.end(JSON.stringify({ conversations })); return; }
    if (request.method === "DELETE" && url.searchParams.get("all") === "true") {
      if (failNextClear) {
        failNextClear = false; response.statusCode = 503;
        response.end('{"error":{"message":"QA geçici bağlantı hatası"}}'); return;
      }
      conversations = []; response.end("{}"); return;
    }
    if (request.method === "PUT") {
      let body = ""; for await (const chunk of request) body += chunk;
      const item = JSON.parse(body).conversation;
      conversations = [...conversations.filter((value) => value.id !== item.id), item];
      response.end("{}"); return;
    }
    response.statusCode = 400; response.end("{}");
  });
  server.listen(19431, "127.0.0.1", () => console.log("ISOLATED_TEST_SERVER_READY"));
} else {
  const browser = await chromium.connectOverCDP("http://127.0.0.1:9225");
  try {
    const page = browser.contexts().flatMap((context) => context.pages())
      .find((candidate) => candidate.url().startsWith("http://127.0.0.1:1431"));
    assert.ok(page, "Isolated Tauri page on port 1431 required");
    const nativeStatus = await page.evaluate(async () => {
      if (!("__TAURI_INTERNALS__" in window)) throw new Error("Native bridge missing");
      const { readCloudStatus } = await import("/src/lib/cloud-history.ts");
      return readCloudStatus();
    });
    assert.equal(nativeStatus.endpoint, endpoint, "Refusing to delete against any other endpoint");
    await page.setViewportSize({ width: 1280, height: 820 });
    await page.reload();
    await page.getByRole("button", { name: "QA görünür sohbet", exact: true }).waitFor();
    const evidenceDir = "outputs/history-v0.4.1";
    await mkdir(evidenceDir, { recursive: true });
    const trigger = page.getByRole("button", { name: "Tüm sohbetleri sil", exact: true });
    const dialog = page.getByRole("dialog", { name: "Tüm sohbetler silinsin mi?" });
    const checks = [];
    for (const dark of [false, true]) {
      await page.evaluate((value) => document.documentElement.classList.toggle("dark", value), dark);
      await trigger.click();
      await dialog.waitFor();
      assert.match(await dialog.innerText(), /2 sohbet · 2 mesaj/);
      assert.equal(await dialog.getByRole("button", { name: "Vazgeç" }).evaluate((el) => el === document.activeElement), true);
      await dialog.screenshot({ path: `${evidenceDir}/confirm-${dark ? "dark" : "light"}.png` });
      await page.keyboard.press("Shift+Tab");
      await page.keyboard.press("Shift+Tab");
      assert.equal(await dialog.getByRole("button", { name: "Tümünü sil" }).evaluate((el) => el === document.activeElement), true);
      await page.keyboard.press("Escape");
      assert.equal(await trigger.evaluate((el) => el === document.activeElement), true);
      checks.push(dark ? "dark-dialog-keyboard" : "light-dialog-keyboard");
    }
    await page.getByRole("button", { name: "Kenar çubuğunu daralt" }).click();
    await trigger.click(); await dialog.waitFor(); await page.keyboard.press("Escape");
    checks.push("collapsed-sidebar");
    await page.getByRole("button", { name: "Kenar çubuğunu genişlet" }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "Sohbet listesini aç" }).click();
    await page.getByRole("complementary", { name: "Sohbet kenar çubuğu" }).last()
      .getByRole("button", { name: "Tüm sohbetleri sil" }).click();
    await dialog.waitFor();
    const bounds = await dialog.boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 390);
    await dialog.screenshot({ path: `${evidenceDir}/confirm-mobile.png` });
    checks.push("mobile-dialog");
    await dialog.getByRole("button", { name: "Tümünü sil" }).click();
    await page.getByRole("alert").filter({ hasText: "Buluttan silinemedi" }).waitFor();
    const failed = await (await fetch("http://127.0.0.1:19431/test/state")).json();
    assert.equal(failed.conversations.length, 2);
    checks.push("native-http-error-visible");
    await page.getByRole("button", { name: "Silmeyi yeniden dene" }).click();
    await page.getByText("Tüm sohbetler buluttan silindi.", { exact: true }).waitFor();
    const cleared = await (await fetch("http://127.0.0.1:19431/test/state")).json();
    assert.equal(cleared.conversations.length, 0);
    assert.equal(cleared.calls.filter((call) => call.method === "DELETE" && call.all === "true").length, 2);
    checks.push("native-http-retry-clears-archive-and-current");
    await page.reload();
    await page.setViewportSize({ width: 1280, height: 820 });
    await page.getByText("Henüz sohbet yok", { exact: true }).first().waitFor();
    await trigger.waitFor();
    assert.equal(await trigger.isDisabled(), true);
    checks.push("reload-remains-empty");
    const evidence = { date: new Date().toISOString(), scope: "native WebView2 with isolated HTTP contract fixture; NOT production", checks, calls: cleared.calls };
    await writeFile(`${evidenceDir}/evidence.json`, JSON.stringify(evidence, null, 2));
    console.log(JSON.stringify(evidence));
  } finally { await browser.close(); }
}
