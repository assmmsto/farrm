/**
 * Safety regression suite — reproduces the field failure:
 * pharmacist mixed two drugs (metronidazole + mebendazole), model answered
 * "no risk to the body", and the app presented that as a calm verdict.
 *
 * Asserts:
 *  1. The safety rules actually reach the model (context split + no absolute reassurance).
 *  2. The user message asks for BOTH the beaker and the body.
 *  3. A reference-less "no risk" answer is never shown as plain reassurance.
 *
 * Run: node standalone/verify-safety.mjs   (after npm run build:standalone)
 */
import { createServer } from "node:http";
import { fileURLToPath, pathToFileURL, URL } from "node:url";
import { chromium } from "playwright";

const PORT = 8803;
const steps = [];
const check = (name, ok) => {
  steps.push({ name, ok });
  if (!ok) throw new Error(`safety check failed: ${name}`);
};

let captured = null;

/** The exact bad answer from the field: reassuring, no reference. */
const BAD_ANSWER = JSON.stringify({
  assumption: "ميترونيدازول = metronidazole، ميبندازول = mebendazole",
  headline: "لا يوجد خطر من أخذهما معاً",
  severity: "none",
  confidence: "high",
  result: "خلط هذين الدواءين لا يؤثر على الجسم، ويمكن إعطاؤهما معاً بأمان.",
  sections: [{ title: "الآلية", body: "لا يوجد تداخل مباشر معروف" }],
  sources: [],
  uncertainties: "",
});

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
    res.end(JSON.stringify({ object: "list", data: [{ id: "mock-safety" }] }));
    return;
  }
  if (req.method === "POST") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      captured = JSON.parse(body);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ choices: [{ message: { role: "assistant", content: BAD_ANSWER } }] }));
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

  await page.getByRole("textbox", { name: "المادة 1", exact: true }).fill("ميترونيدازول");
  await page.getByRole("textbox", { name: "المادة 2", exact: true }).fill("ميبندازول");
  await page.getByRole("textbox", { name: "كمية المادة 1" }).fill("500");
  await page.getByRole("textbox", { name: "كمية المادة 2" }).fill("500");
  await page.getByRole("textbox", { name: "المرجع أو المعيار" }).fill("Lexicomp");
  await page.getByRole("textbox", { name: "عمر المريض" }).fill("30");
  await page.getByRole("textbox", { name: "وزن المريض" }).fill("70");
  await page.getByRole("button", { name: "أجرِ التحقق من الإعطاء" }).click();
  await page.getByText("لا يوجد خطر من أخذهما معاً").first().waitFor({ timeout: 20000 });

  const system = captured?.messages?.[0]?.content ?? "";
  const user = captured?.messages?.[1]?.content ?? "";

  // 1) Safety rules must reach the model, verbatim in substance.
  check("system forbids absolute reassurance", system.includes("يُمنع منعاً باتاً أي تطمين مطلق"));
  check(
    "system forbids beaker framing and mandates patient-only",
    system.includes("يُمنع تماماً تقييم") && system.includes("إعطاء المريض فقط"),
  );
  check("system states absence of evidence is not safety", system.includes("غياب الدليل ليس دليل السلامة"));

  // 2) The user turn must carry dose, route and patient facts — no beaker.
  check("user message carries doses", user.includes("ميترونيدازول — 500 mg"));
  check("user message carries patient data", user.includes("العمر: 30") && user.includes("الوزن: 70"));
  check("user message never asks about a beaker", !/وعاء|أنبوب/i.test(user));

  // 3) The reassuring, unreferenced answer must be flagged in the UI.
  const text = await page.evaluate(() => document.body.innerText);
  check("UI flags unverified reassurance", text.includes("تحذير: تطمين غير مُثبت"));
  check("UI shows «بلا مرجع معلن»", text.includes("بلا مرجع معلن"));

  console.log(JSON.stringify({ ok: true, steps }, null, 2));
} finally {
  await browser.close();
  server.close();
}
