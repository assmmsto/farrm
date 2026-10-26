/**
 * Diagnostic: reproduce what happens when a provider/proxy does NOT send CORS
 * headers, from a browser (file:// page). Confirms the exact error text the
 * user would see — used to pinpoint the "worked before, never works now" case.
 * Run: node standalone/diag-cors.mjs
 */
import { createServer } from "node:http";
import { fileURLToPath, pathToFileURL, URL } from "node:url";
import { chromium } from "playwright";

const PORT = 8788;

const server = createServer((req, res) => {
  // Purposely NO Access-Control-* headers anywhere: the classic provider that
  // "always worked" when called from a server, but blocks browser-direct calls.
  if (req.method === "OPTIONS") {
    res.writeHead(404);
    res.end();
    return;
  }
  if (req.method === "GET" && req.url?.endsWith("/models")) {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ data: [{ id: "mock-model" }] }));
    return;
  }
  res.writeHead(404);
  res.end();
});

await new Promise((resolveListen) => server.listen(PORT, resolveListen));

const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  const target = pathToFileURL(
    fileURLToPath(new URL("../dist-standalone/pharmacy-lab.html", import.meta.url)),
  ).href;
  await page.goto(target, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "إعداد المزوّد" }).click();
  await page.locator("#provider-url").fill(`http://127.0.0.1:${PORT}/v1`);
  await page.locator("#provider-key").fill("diag-key");
  await page.getByRole("button", { name: "فحص الاتصال وجلب النماذج" }).click();
  await page.waitForTimeout(3500);
  const danger = await page.locator(".text-danger").first();
  const shown = (await danger.count()) ? await danger.innerText() : "(لا ظهر خطأ)";
  console.log(JSON.stringify({ scenario: "no-cors-proxy", errorTextShownToUser: shown, consoleErrors }, null, 2));

  // Scenario 2: a domain that simply does not exist → must show the precise
  // "unreachable" message (DNS failure), not the generic CORS-flavoured one.
  await page.goto(target, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "إعداد المزوّد" }).click();
  await page.locator("#provider-url").fill("https://nonexistent-proxy-zz9.invalid/v1");
  await page.locator("#provider-key").fill("diag-key");
  await page.getByRole("button", { name: "فحص الاتصال وجلب النماذج" }).click();
  await page.waitForSelector(".text-danger", { timeout: 30000 });
  const shown2 = await page.locator(".text-danger").first().innerText();
  const result2 = {
    scenario: "dead-domain",
    errorTextShownToUser: shown2,
    isUnreachableMessage: shown2.includes("لا يُعرَّف"),
  };
  console.log(JSON.stringify(result2, null, 2));
  if (!result2.isUnreachableMessage) process.exit(1);
} finally {
  await browser.close();
  server.close();
}
