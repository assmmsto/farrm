/**
 * Accuracy regression suite. Locks the three defects found in the field:
 *  1. Arabic severity words («عالية»…) must map to a real severity, never "unknown".
 *  2. The request must ask for JSON mode (response_format).
 *  3. "unknown" severity must be surfaced as unverified, and sources/confidence
 *     must be parsed and shown.
 *
 * Run: node standalone/verify-accuracy.mjs   (after npm run build:standalone)
 */
import { createServer } from "node:http";
import { fileURLToPath, pathToFileURL, URL } from "node:url";
import { chromium } from "playwright";

const PORT = 8802;
const steps = [];
const check = (name, ok) => {
  steps.push({ name, ok });
  if (!ok) throw new Error(`accuracy check failed: ${name}`);
};

let captured = null;

/** Realistic model output: Arabic severity word, prose wrapper, sources. */
const ANSWER = `إليك التقييم:
{
  "assumption": "أسبرين = aspirin، ديكلون = diclofenac",
  "headline": "خطر نزف هضمي مرتفع",
  "severity": "عالية",
  "confidence": "متوسطة",
  "result": "الجمع بينهما يضاعف خطر النزف المعدي.",
  "sections": [{"title": "الآلية", "body": "تثبيط COX مزدوج"}],
  "sources": ["Lexicomp", "Micromedex"],
  "uncertainties": "لم تُحدَّد الجرعة"
}`;

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
    res.end(JSON.stringify({ object: "list", data: [{ id: "mock-acc" }] }));
    return;
  }
  if (req.method === "POST") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      captured = JSON.parse(body);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ choices: [{ message: { role: "assistant", content: ANSWER } }] }));
    });
    return;
  }
  res.writeHead(404);
  res.end();
});
await new Promise((r) => server.listen(PORT, r));

const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
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
  await page.getByRole("textbox", { name: "عمر المريض" }).fill("30");
  await page.getByRole("textbox", { name: "وزن المريض" }).fill("70");
  await page.getByRole("button", { name: "تحقّق من الإعطاء" }).click();
  await page.getByText("خطر نزف هضمي مرتفع").first().waitFor({ timeout: 20000 });

  // 1) Arabic severity word must resolve to a real level.
  const text = await page.evaluate(() => document.body.innerText);
  check("Arabic severity «عالية» renders as «خطر عالٍ»", text.includes("خطر عالٍ"));

  // 2) The request must opt into JSON mode.
  check("request sends response_format json_object", captured?.response_format?.type === "json_object");

  // 3) Sources + confidence are parsed and displayed.
  check("declared sources are shown", text.includes("Lexicomp") && text.includes("Micromedex"));
  check("confidence is shown as «متوسطة»", text.includes("ثقة النموذج") && text.includes("متوسطة"));

  // 4) The model prompt must not contain fillable placeholder prose that models copy.
  const system = captured?.messages?.[0]?.content ?? "";
  check("prompt no longer exposes copyable placeholder sentences", !system.includes("شو رح يصير"));

  console.log(JSON.stringify({ ok: true, steps }, null, 2));
} finally {
  await browser.close();
  server.close();
}
