/**
 * Visible-report audit: feeds realistic model answers through the real app and
 * prints exactly what a pharmacist would SEE, then asserts safety-critical
 * expectations. This is the "check the report and results" pass.
 *
 * Run: node standalone/audit-visible.mjs   (after npm run build:standalone)
 */
import { createServer } from "node:http";
import { fileURLToPath, pathToFileURL, URL } from "node:url";
import { chromium } from "playwright";

const PORT = 8807;
let answer = "";
let captured = null;

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
    res.end(JSON.stringify({ object: "list", data: [{ id: "mock-live" }] }));
    return;
  }
  if (req.method === "POST") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      captured = JSON.parse(body);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ choices: [{ message: { role: "assistant", content: answer } }] }));
    });
    return;
  }
  res.writeHead(404);
  res.end();
});
await new Promise((r) => server.listen(PORT, r));

const browser = await chromium.launch({ channel: "msedge", headless: true });
const lookups = [];

async function runCase(name, payload, expectText) {
  answer = payload;
  const page = await browser.newPage({ viewport: { width: 390, height: 1000 } });
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
  await page.getByRole("textbox", { name: "وزن المريض" }).fill("70");
  await page.getByRole("button", { name: "تحقّق من الإعطاء" }).click();
  await page.getByText(expectText, { exact: false }).first().waitFor({ timeout: 20000 });

  const text = await page.evaluate(() => document.body.innerText);
  lookups.push({ case: name, visible: text.split("\n").filter(Boolean) });
  await page.close();
  return text;
}

const results = [];
const check = (name, ok, extra = "") => results.push({ name, ok, extra });

/* A. Dangerous answer reported as HIGH risk — must show the risk loudly. */
const highText = await runCase(
  "high risk",
  JSON.stringify({
    headline: "خطر عالٍ: تضاعف التثبيط العصبي",
    severity: "major",
    confidence: "medium",
    result: "لا يُنصح بإعطائهما معاً؛ راجع الطبيب.",
    sections: [
      { title: "تقييم الجرعة", body: "500 مغ لكل مادة ضمن المدى المعتاد." },
      { title: "التوصية العملية", body: "افصل بين الجرعتين أو اختر بديلاً." },
    ],
    sources: ["Micromedex"],
    uncertainties: "لم تُذكر وظائف الكبد.",
  }),
  "خطر عالٍ",
);
check("A1 severity badge shows «خطر عالٍ»", highText.includes("خطر عالٍ"));
check("A2 confidence shown", highText.includes("ثقة النموذج: متوسطة"));
check("A3 source count shown", highText.includes("عن 1 مرجع"));
check("A4 sections numbered and titled", highText.includes("1. تقييم الجرعة") && highText.includes("2. التوصية العملية"));
check("A5 uncertainties shown", highText.includes("ما لم يُحسم"));
check("A6 no false 'unverified' warning when a source exists", !highText.includes("تطمين غير مُثبت"));

/* B. Reassuring answer with NO source — must be flagged, never calm. */
const safeText = await runCase(
  "unverified reassurance",
  JSON.stringify({
    headline: "لا يوجد خطر",
    severity: "none",
    confidence: "high",
    result: "يمكن إعطاؤهما معاً بأمان.",
    sections: [{ title: "الخلاصة", body: "لا تداخل مهم" }],
    sources: [],
  }),
  "لا يوجد خطر",
);
check("B1 warning banner present", safeText.includes("تحذير: تطمين غير مُثبت"));
check("B2 says no source declared", safeText.includes("بلا مرجع معلن"));
check("B3 warning explains absence ≠ safety", safeText.includes("غياب المعلومة ليس دليل سلامة"));

/* C. Unsettled severity — must say unknown is not safety. */
const unknownText = await runCase(
  "unsettled",
  JSON.stringify({
    headline: "لم أستطع الحسم",
    severity: "غير محسوم",
    confidence: "low",
    result: "لا أملك مرجعاً كافياً.",
    sections: [{ title: "السبب", body: "لا يوجد توثيق صريح" }],
    sources: [],
  }),
  "لم أستطع الحسم",
);
check("C1 unknown badge", unknownText.includes("غير محسوم"));
check("C2 unknown-is-not-safety line", unknownText.includes("ليست درجة أمان"));

/* D. Arabic severity word «خطير» — the parser bug that was fixed. */
const dangerousAnswer = JSON.stringify({
  headline: "الجمع خطير",
  severity: "خطير",
  confidence: "high",
  result: "لا تعطهما معاً.",
  sections: [],
  sources: ["Lexicomp"],
});
const dangerousText = await runCase("arabic severity", dangerousAnswer, "الجمع خطير");
check("D1 «خطير» renders as major badge", dangerousText.includes("خطر عالٍ"));

const failed = results.filter((r) => !r.ok);
console.log(JSON.stringify({ total: results.length, failed, lookups }, null, 2));
await browser.close();
server.close();
if (failed.length > 0) process.exitCode = 1;
