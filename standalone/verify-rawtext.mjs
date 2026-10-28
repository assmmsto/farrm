/**
 * Regression for the "random unformatted text" complaint:
 * when the model returns prose that is NOT a valid report, the UI must never
 * dump it as one raw wall of text. It must show a clear failure notice, a
 * retry action, and any residual text broken into separated blocks.
 *
 * Run: node standalone/verify-rawtext.mjs   (after npm run build:standalone)
 */
import { createServer } from "node:http";
import { fileURLToPath, pathToFileURL, URL } from "node:url";
import { chromium } from "playwright";

const PORT = 8806;
const steps = [];
const check = (name, ok, extra = "") => {
  steps.push({ name, ok, extra });
  if (!ok) throw new Error(`rawtext check failed: ${name}`);
};

/** Deliberately unstructured model output — the failure the user reported. */
const SLOPPY = [
  "بالتأكيد! إليك التحليل:",
  "",
  "ميترونيدازول هو مضاد حيوي. ميبندازول طارد ديدان.",
  "- الجرعة 500 ملغ لكل منهما",
  "- الطريق فموي",
  "لا توجد مشكلة كبيرة على ما أظن.",
].join("\n");

const server = createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "authorization, content-type, accept");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }
  if (req.method === "GET" && req.url?.endsWith("/models")) {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ object: "list", data: [{ id: "mock-sloppy" }] }));
    return;
  }
  if (req.method === "POST") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ choices: [{ message: { role: "assistant", content: SLOPPY } }] }));
    });
    return;
  }
  res.writeHead(404);
  res.end();
});
await new Promise((r) => server.listen(PORT, r));

const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
  await page.goto(
    pathToFileURL(fileURLToPath(new URL("../dist-standalone/pharmacy-lab.html", import.meta.url))).href,
    { waitUntil: "networkidle" },
  );

  await page.getByRole("button", { name: "إعداد المزوّد" }).click();
  await page.locator("#provider-url").fill(`http://127.0.0.1:${PORT}/v1`);
  await page.locator("#provider-key").fill("k");
  await page.getByRole("button", { name: "فحص الاتصال وجلب النماذج" }).click();
  await page.getByText(/تم الاتصال/).first().waitFor({ timeout: 20000 });
  await page.getByRole("button", { name: "إغلاق" }).click();

  await page.getByRole("textbox", { name: "المادة 1", exact: true }).fill("ميترونيدازول");
  await page.getByRole("textbox", { name: "المادة 2", exact: true }).fill("ميبندازول");
  await page.getByRole("textbox", { name: "كمية المادة 1" }).fill("500");
  await page.getByRole("textbox", { name: "كمية المادة 2" }).fill("500");
  await page.getByRole("textbox", { name: "عمر المريض" }).fill("30");
  await page.getByRole("button", { name: "تحقّق من الإعطاء" }).click();

  await page.getByText("لم يصلح الجواب كتقرير منظّم").first().waitFor({ timeout: 20000 });

  const text = await page.evaluate(() => document.body.innerText);

  // 1) A clear, honest failure notice — not a silent dump.
  check("shows failure notice", text.includes("لم يصلح الجواب كتقرير منظّم"));
  check("offers retry action", text.includes("أعد المحاولة"));

  // 2) Raw text is NOT rendered in a single unformatted <pre>.
  const preCount = await page.locator("pre").count();
  check("no raw <pre> dump", preCount === 0, `pre=${preCount}`);

  // 3) Residual text is broken into separated list items.
  const blocks = await page.locator("details ol li").count();
  check("text split into blocks", blocks >= 3, `blocks=${blocks}`);

  // 4) Residual text is collapsed behind a summary, not shown by default.
  const detailsOpen = await page.locator("details").first().evaluate((el) => el.open);
  check("raw text collapsed by default", detailsOpen === false);

  console.log(JSON.stringify({ ok: true, steps }, null, 2));
} finally {
  await browser.close();
  server.close();
}
