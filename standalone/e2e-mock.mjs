/**
 * End-to-end functional test of the real artifact (dist-standalone/pharmacy-lab.html)
 * against a local MOCK OpenAI-compatible provider. Proves the whole chain:
 * settings save → model fetch → lab run → report render → history persist —
 * with zero cloud. Uses system Edge (Playwright channel msedge).
 *
 * Run: node standalone/e2e-mock.mjs   (after npm run build:standalone)
 */
import { createServer } from "node:http";
import { fileURLToPath, pathToFileURL, URL } from "node:url";
import { chromium } from "playwright";

const PORT = 8787;
const BASE = `http://127.0.0.1:${PORT}/v1`;

const LAB_REPORT = {
  assumption: "ديكلون = diclofenac حسب الافتراض المحلي الشائع",
  headline: "جمع مضادَّي التهاب: خطر نزف هضمي مرتفع",
  severity: "major",
  result: "أسبرين مع ديكلوفيناك مثبطان غير انتقائيين لـ COX، والجمع بينهما يضاعف التهيّج والنزف المعدي المعوي دون فائدة إضافية.",
  sections: [
    { title: "الآلية الدوائية", body: "تثبيط مزدوج لإنزيم COX-1 الواقي للمخاطية." },
    { title: "التوصية العملية", body: "تجنّب الجمع؛ اختر واحداً وأضف حماية معدية عند الضرورة." },
  ],
  uncertainties: "لم تُحدَّد الجرعات ولا عوامل خطورة المريض.",
};

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "authorization, content-type, accept");
}

const server = createServer((req, res) => {
  cors(res);
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }
  if (req.method === "GET" && req.url?.endsWith("/models")) {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ object: "list", data: [{ id: "mock-fast-1" }, { id: "mock-pro-2" }] }));
    return;
  }
  if (req.method === "POST" && req.url?.endsWith("/chat/completions")) {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          choices: [
            { message: { role: "assistant", content: JSON.stringify(LAB_REPORT) } },
          ],
        }),
      );
    });
    return;
  }
  res.writeHead(404, { "content-type": "application/json" });
  res.end(JSON.stringify({ error: { message: "unknown mock path" } }));
});

await new Promise((resolveListen) => server.listen(PORT, resolveListen));

const target = pathToFileURL(
  fileURLToPath(new URL("../dist-standalone/pharmacy-lab.html", import.meta.url)),
).href;

const steps = [];
function step(name, ok) {
  steps.push({ name, ok });
  if (!ok) throw new Error(`E2E step failed: ${name}`);
}

const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(String(error)));

  await page.goto(target, { waitUntil: "networkidle" });

  // 1) Open provider settings
  await page.getByRole("button", { name: "إعداد المزوّد" }).click();
  await page.locator("#provider-url").fill(BASE);
  await page.locator("#provider-key").fill("e2e-secret-key");

  // 2) Test connection → should fetch models over CORS
  await page.getByRole("button", { name: "فحص الاتصال وجلب النماذج" }).click();
  await page.waitForSelector("text=تم الاتصال", { timeout: 15000 });
  step("provider test connection + models fetch (CORS direct)", true);

  const selectValue = await page.locator("#provider-model").inputValue();
  step(`model auto-selected (${selectValue})`, Boolean(selectValue));

  await page.getByRole("button", { name: "إغلاق" }).click();

  // 3) Run the lab with two compounds
  await page.getByRole("textbox", { name: "المادة 1", exact: true }).fill("أسبرين");
  await page.getByRole("textbox", { name: "المادة 2", exact: true }).fill("ديكلون");
  await page.getByRole("textbox", { name: "كمية المادة 1" }).fill("500");
  await page.getByRole("textbox", { name: "كمية المادة 2" }).fill("500");
  await page.getByRole("textbox", { name: "المرجع أو المعيار" }).fill("Lexicomp");
  await page.getByRole("textbox", { name: "عمر المريض" }).fill("30");
  await page.getByRole("textbox", { name: "وزن المريض" }).fill("70");
  await page.getByRole("button", { name: "أجرِ التحقق من الإعطاء" }).click();
  await page.waitForSelector(`text=${LAB_REPORT.headline}`, { timeout: 15000 });
  step("lab run → report headline rendered", true);

  await page.waitForSelector('text=خطر عالٍ', { timeout: 5000 });
  step("severity badge «خطر عالٍ» rendered", true);

  // 4) History tab must list the run (persisted)
  await page.getByRole("tab", { name: /السجل/ }).click();
  await page.locator("#panel-history").getByText(/أسبرين 500 mg \+ ديكلون 500 mg/).waitFor({ timeout: 5000 });
  step("history tab lists the run", true);

  // 5) localStorage persistence (reload must keep provider + history)
  await page.reload({ waitUntil: "networkidle" });
  const persisted = await page.evaluate(() => ({
    provider: localStorage.getItem("pharmacy.provider.v1") ?? "",
    history: localStorage.getItem("pharmacy.history.v1") ?? "",
  }));
  step("provider persisted locally after reload", persisted.provider.includes(`127.0.0.1:${PORT}`));
  step("history persisted locally after reload", persisted.history.includes("أسبرين"));
  step("model shown on settings button after reload",
    Boolean(await page.getByRole("button", { name: /mock-(fast|pro)/ }).count()));

  step("no console errors during the whole flow", consoleErrors.length === 0);
} finally {
  await browser.close();
  server.close();
}

console.log(JSON.stringify({ ok: true, steps }, null, 2));
