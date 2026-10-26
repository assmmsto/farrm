/**
 * Verifies the "double-click" desktop solution BEFORE shipping it:
 * Edge/Chrome launched with --disable-web-security in a throwaway profile
 * fetches a no-CORS provider (river.ai-like) straight from the file:// page,
 * exactly like the APK does natively.
 *
 * Run: node standalone/verify-desktop-unrestricted.mjs
 */
import { createServer } from "node:http";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL, URL } from "node:url";
import { chromium } from "playwright";

const PORT = 8792;
const KEY = "sk-desktop-test";

const provider = createServer((req, res) => {
  const auth = req.headers.authorization || "";
  const json = (status, body) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  };
  // No CORS headers anywhere — the point of the test.
  if (auth !== `Bearer ${KEY}`) {
    json(401, {
      error: { message: "Missing or invalid Authorization header. Expected: Bearer <api-key>" },
    });
    return;
  }
  if (req.method === "GET" && req.url?.endsWith("/models")) {
    json(200, { object: "list", data: [{ id: "river-large" }, { id: "gpt-4o-mini" }] });
    return;
  }
  if (req.method === "POST" && req.url?.endsWith("/chat/completions")) {
    json(200, {
      choices: [{ message: { role: "assistant", content: "خطر عالٍ: تداخل محتمل." } }],
    });
    return;
  }
  json(404, { error: { message: "not found" } });
});
await new Promise((r) => provider.listen(PORT, r));

const profile = mkdtempSync(join(tmpdir(), "plab-nosec-"));
const context = await chromium.launchPersistentContext(profile, {
  channel: "msedge",
  headless: true,
  viewport: { width: 1280, height: 860 },
  args: ["--disable-web-security", "--no-first-run"],
});
const page = context.pages()[0] ?? (await context.newPage());
const target = pathToFileURL(
  fileURLToPath(new URL("../dist-standalone/pharmacy-lab.html", import.meta.url)),
).href;
await page.goto(target, { waitUntil: "networkidle" });

await page.getByRole("button", { name: "إعداد المزوّد" }).click();
await page.locator("#provider-url").fill(`http://127.0.0.1:${PORT}/v1`);
await page.locator("#provider-key").fill(KEY);
await page.getByRole("button", { name: "فحص الاتصال وجلب النماذج" }).click();

const ok = await page
  .getByText(/تم الاتصال/)
  .first()
  .waitFor({ timeout: 20000 })
  .then(() => true)
  .catch(() => false);
const shown = ok
  ? await page.getByText(/تم الاتصال/).first().innerText()
  : await page.locator(".text-danger").first().innerText().catch(() => "(لا نص)");

await page.screenshot({ path: "screenshots/desktop-unrestricted.png" });
console.log(JSON.stringify({ browserWithoutWebSecurity: ok, shown }, null, 2));

await context.close();
provider.close();
process.exit(ok ? 0 : 1);