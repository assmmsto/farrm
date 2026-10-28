/**
 * Verifies the patient-only contract:
 *  - the form refuses to run without doses / route / standard / age
 *  - what reaches the model contains quantities, route, standard and patient
 *  - the prompt never asks about a beaker
 *
 * Run: node standalone/verify-patient.mjs   (after npm run build:standalone)
 */
import { createServer } from "node:http";
import { fileURLToPath, pathToFileURL, URL } from "node:url";
import { chromium } from "playwright";

const PORT = 8804;
const steps = [];
const check = (name, ok) => {
  steps.push({ name, ok });
  if (!ok) throw new Error(`patient check failed: ${name}`);
};

let captured = null;
const ANSWER = JSON.stringify({
  assumption: "ميترونيدازول 500mg + ميبندازول 500mg فموي، بالغ 30 سنة",
  headline: "جرعتان ضمن المدى المعتاد — لكن تحقق من تداخل الأمان",
  severity: "moderate",
  confidence: "medium",
  result: "الجرعتان المطلوبتان تقعان ضمن المدى المعتاد للبالغ، ولا يوجد تداخل مباشر موثق يمنع الجمع.",
  sections: [{ title: "تقييم الجرعة", body: "500mg لكل منهما جرعة قياسية للبالغ." }],
  sources: ["Lexicomp"],
  uncertainties: "لم تُذكر وظائف الكبد.",
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
    res.end(JSON.stringify({ object: "list", data: [{ id: "mock-patient" }] }));
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
  const page = await browser.newPage({ viewport: { width: 430, height: 1600 } });
  await page.goto(
    pathToFileURL(fileURLToPath(new URL("../dist-standalone/pharmacy-lab.html", import.meta.url))).href,
    { waitUntil: "networkidle" },
  );

  // Provider setup
  await page.getByRole("button", { name: "إعداد المزوّد" }).click();
  await page.locator("#provider-url").fill(`http://127.0.0.1:${PORT}/v1`);
  await page.locator("#provider-key").fill("k");
  await page.getByRole("button", { name: "فحص الاتصال وجلب النماذج" }).click();
  await page.getByText(/تم الاتصال/).first().waitFor({ timeout: 20000 });
  await page.getByRole("button", { name: "إغلاق" }).click();

  // 1) The run button must be disabled until the data is complete.
  const runBtn = page.getByRole("button", { name: "تحقّق من الإعطاء" });
  check("run button disabled on empty form", await runBtn.isDisabled());
  const emptyText = await page.evaluate(() => document.body.innerText);
  check("empty form asks for substances", emptyText.includes("اكتب مادتين"));
  check("empty form asks for age", emptyText.includes("أدخل عمر المريض"));
  // Fields that cannot change the verdict must NOT be asked for.
  check("no reference-standard field", !emptyText.includes("المعيار المرجعي"));
  check("no conditions field", !emptyText.includes("حالات طبية"));
  check("no extra-substance button", !emptyText.includes("مادة أخرى"));

  // 2) Fill substances only — still blocked because no dose.
  await page.getByRole("textbox", { name: "المادة 1", exact: true }).fill("ميترونيدازول");
  await page.getByRole("textbox", { name: "المادة 2", exact: true }).fill("ميبندازول");
  await page.waitForTimeout(200);
  const doseText = await page.evaluate(() => document.body.innerText);
  check("missing-dose issue appears once names are entered", doseText.includes("أدخل كمية"));
  check("still disabled without doses", await runBtn.isDisabled());

  // 3) Complete the record.
  await page.getByRole("textbox", { name: "كمية المادة 1" }).fill("500");
  await page.getByRole("textbox", { name: "كمية المادة 2" }).fill("500");
  await page.getByRole("textbox", { name: "عمر المريض" }).fill("30");
  await page.getByRole("textbox", { name: "وزن المريض" }).fill("70");
  // Conditions/note live behind the «حالات» toggle to keep one compact screen.
  await page.waitForTimeout(200);
  check("enabled once complete", await runBtn.isEnabled());

  // 4) Route is a toggle strip (not a select window).
  await page.getByRole("button", { name: "وريدي — بلعة", exact: true }).click();
  check("route selected", (await page.getByRole("button", { name: "وريدي — بلعة", exact: true }).getAttribute("aria-pressed")) === "true");

  await runBtn.click();
  await page.getByText("جرعتان ضمن المدى المعتاد", { exact: false }).first().waitFor({ timeout: 20000 });

  const user = captured?.messages?.[1]?.content ?? "";
  const system = captured?.messages?.[0]?.content ?? "";

  // 5) The model must receive doses, route and patient — and no fake "standard".
  check("prompt carries dose 1", user.includes("ميترونيدازول — 500 mg"));
  check("prompt carries dose 2", user.includes("ميبندازول — 500 mg"));
  check("prompt carries route", user.includes("وريدي — بلعة"));
  check("prompt carries patient age/weight", user.includes("العمر: 30") && user.includes("الوزن: 70"));
  check("prompt does not claim a reference standard", !/المعيار المرجعي|Lexicomp|BNF/.test(user));

  // 6) No beaker framing as a *task*: the only allowed mention is the prohibition.
  check("system forbids beaker framing", system.includes("يُمنع تماماً تقييم"));
  check("system task is patient administration", system.includes("إعطاء المريض فقط"));
  check("user never mentions a beaker", !/وعاء|أنبوب|beaker/i.test(user));

  // 7) JSON mode still enforced.
  check("json mode sent", captured?.response_format?.type === "json_object");

  console.log(JSON.stringify({ ok: true, steps }, null, 2));
} finally {
  await browser.close();
  server.close();
}
