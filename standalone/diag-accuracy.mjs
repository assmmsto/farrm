/**
 * Diagnostic: shows EXACTLY what the app sends to the provider and how the
 * returned answer is parsed. Runs the real built single-file against a mock
 * that echoes the request back, so we can inspect the prompt and the parser
 * behaviour on realistic model output (including sloppy output).
 *
 * Run: node standalone/diag-accuracy.mjs
 */
import { createServer } from "node:http";
import { fileURLToPath, pathToFileURL, URL } from "node:url";
import { chromium } from "playwright";

const PORT = 8801;
let lastRequest = null;

// A deliberately *sloppy but realistic* model answer: prose + JSON, which is
// what most models produce when asked for "JSON only" without enforcement.
const SLOPPY = `بالتأكيد، إليك التقييم:
\`\`\`json
{
  "assumption": "أسبرين = aspirin، ديكلون = diclofenac",
  "headline": "خطر نزف هضمي مرتفع",
  "severity": "عالية",
  "result": "الجمع بينهما يضاعف خطر النزف.",
  "sections": [{"title": "الآلية", "body": "تثبيط COX مزدوج"}],
  "uncertainties": ""
}
\`\`\`
أتمنى أن يكون هذا مفيداً.`;

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
    res.end(JSON.stringify({ object: "list", data: [{ id: "mock" }] }));
    return;
  }
  if (req.method === "POST") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      lastRequest = JSON.parse(body);
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
const page = await browser.newPage({ viewport: { width: 430, height: 1400 } });
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
  await page.getByRole("textbox", { name: "المادة 1", exact: true }).fill("أسبرين");
  await page.getByRole("textbox", { name: "المادة 2", exact: true }).fill("ديكلون");
  await page.getByRole("textbox", { name: "كمية المادة 1" }).fill("500");
  await page.getByRole("textbox", { name: "كمية المادة 2" }).fill("500");
  await page.getByRole("textbox", { name: "المرجع أو المعيار" }).fill("Lexicomp");
  await page.getByRole("textbox", { name: "عمر المريض" }).fill("30");
  await page.getByRole("textbox", { name: "وزن المريض" }).fill("70");
  await page.getByRole("button", { name: "تحقّق من الإعطاء" }).click();
await page.waitForTimeout(2500);

const rendered = await page.evaluate(() => document.body.innerText);
await browser.close();
server.close();

console.log("=== REQUEST PAYLOAD (what the model receives) ===");
console.log("model      :", lastRequest?.model);
console.log("temperature:", lastRequest?.temperature ?? "(not sent)");
console.log("max_tokens :", lastRequest?.max_tokens ?? "(not sent)");
console.log("response_format:", JSON.stringify(lastRequest?.response_format) ?? "(not sent)");
console.log("--- SYSTEM ---\n" + (lastRequest?.messages?.[0]?.content ?? ""));
console.log("--- USER ---\n" + (lastRequest?.messages?.[1]?.content ?? ""));

console.log("\n=== RENDERED RESULT (what the user sees) ===");
const start = rendered.indexOf("أسبرين");
console.log(rendered.slice(Math.max(0, start - 200)).slice(0, 900));
console.log("\n=== VERDICT ===");
console.log("severity badge shown   :", rendered.includes("خطر عالٍ"));
console.log("raw prose leaked to UI :", rendered.includes("أتمنى أن يكون هذا مفيداً"));
