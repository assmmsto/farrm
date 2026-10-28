/**
 * STRICT verification of the rewritten provider transport.
 *
 * Two servers:
 *   · 8790 — a river.ai-like provider: OpenAI-shaped JSON, 401 without a valid
 *     Bearer key, model list and chat completions with it, and NO CORS headers
 *     whatsoever (exactly api.river.ai, verified live).
 *   · 8791 — the local relay in front of it, which adds CORS headers.
 *
 * Two runtimes exercised in a real Edge browser against the built single file:
 *   A. NATIVE: a stub `window.Capacitor` is injected (isNativePlatform → true,
 *      Plugins.CapacitorHttp.request) implementing Capacitor's documented
 *      contract by fetching through the relay. Native HTTP has no CORS, so this
 *      faithfully emulates the APK while executing OUR transport code.
 *   B. WEB: no stub → plain fetch → the browser blocks the no-CORS provider,
 *      and the app must show the NEW actionable browser_blocked_file message.
 *
 * Run: node standalone/verify-transport.mjs
 */
import { createServer } from "node:http";
import { fileURLToPath, pathToFileURL, URL } from "node:url";
import { chromium } from "playwright";

const PROVIDER = 8790;
const RELAY = 8791;
const KEY = "sk-river-test-key";

const models = ["gpt-4o-mini", "river-large", "qwen-2.5"];

/** river.ai-like provider: OpenAI shapes, no CORS headers, Bearer auth. */
const provider = createServer((req, res) => {
  const auth = req.headers.authorization || "";
  const json = (status, body) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  };
  if (auth !== `Bearer ${KEY}`) {
    json(401, {
      error: {
        message: "Missing or invalid Authorization header. Expected: Bearer <api-key>",
        type: "invalid_request_error",
        code: null,
      },
    });
    return;
  }
  if (req.method === "GET" && req.url?.endsWith("/models")) {
    json(200, { object: "list", data: models.map((id) => ({ id, object: "model" })) });
    return;
  }
  if (req.method === "POST" && req.url?.endsWith("/chat/completions")) {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      let parsed = {};
      try {
        parsed = JSON.parse(raw);
      } catch {
        /* ignore */
      }
      const prompt = JSON.stringify(parsed.messages ?? "");
      const report =
        "## تقييم التداخل\nخطر عالٍ: احتمال تداخل دوائي مهم.\n\n- المتابعة: قياس INR\n- التوصية: مراجعة الطبيب";
      json(200, {
        id: "chatcmpl-test",
        choices: [{ index: 0, message: { role: "assistant", content: report }, finish_reason: "stop" }],
        system_echo: prompt.slice(0, 40),
      });
    });
    return;
  }
  json(404, { error: { message: "not found" } });
});

/** Relay: same origin for the browser, forwards to the provider, adds CORS. */
const relay = createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    req.headers["access-control-request-headers"] || "authorization, content-type, accept",
  );
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }
  const chunks = [];
  req.on("data", (chunk) => chunks.push(chunk));
  req.on("end", async () => {
    const headers = {};
    for (const [name, value] of Object.entries(req.headers)) {
      if (["host", "origin", "referer", "content-length", "connection"].includes(name)) continue;
      headers[name] = Array.isArray(value) ? value.join(", ") : value;
    }
    const upstream = await fetch(`http://127.0.0.1:${PROVIDER}${req.url}`, {
      method: req.method,
      headers,
      body: chunks.length ? Buffer.concat(chunks) : undefined,
    });
    const text = await upstream.text();
    res.writeHead(upstream.status, {
      "content-type": upstream.headers.get("content-type") || "application/json",
    });
    res.end(text);
  });
});

await new Promise((r) => provider.listen(PROVIDER, r));
await new Promise((r) => relay.listen(RELAY, r));

const results = [];
const check = (name, pass, info) => {
  results.push({ name, pass, info });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${info ? ` — ${info}` : ""}`);
};

const browser = await chromium.launch({ channel: "msedge", headless: true });
const target = pathToFileURL(
  fileURLToPath(new URL("../dist-standalone/pharmacy-lab.html", import.meta.url)),
).href;

/** Opens the app with (or without) a stubbed native Capacitor runtime. */
async function openApp({ native }) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const consoleErrors = [];
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text());
  });
  if (native) {
    await page.addInitScript(
      ({ relayPort }) => {
        // Emulates the APK: native HTTP, no CORS, headers passed straight through.
        window.Capacitor = {
          isNativePlatform: () => true,
          getPlatform: () => "android",
          Plugins: {
            CapacitorHttp: {
              request: async (options) => {
                const response = await fetch(`http://127.0.0.1:${relayPort}${new URL(options.url).pathname}`, {
                  method: options.method || "GET",
                  headers: options.headers || {},
                  body: options.data,
                });
                const text = await response.text();
                let data = text;
                try {
                  data = JSON.parse(text);
                } catch {
                  /* keep text */
                }
                return { status: response.status, data, url: options.url };
              },
            },
          },
        };
      },
      { relayPort: RELAY },
    );
  }
  await page.goto(target, { waitUntil: "networkidle" });
  return { page, consoleErrors };
}

async function configure(page, url, key) {
  await page.getByRole("button", { name: "إعداد المزوّد" }).click();
  await page.locator("#provider-url").fill(url);
  await page.locator("#provider-key").fill(key);
}

async function errorText(page) {
  // The provider status line has a stable id; `.text-danger` alone also matches
  // the required-field asterisks in the patient form.
  const danger = page.locator("#provider-status");
  await danger.waitFor({ timeout: 30000 });
  return (await danger.innerText()).trim();
}

/* ---- A1: NATIVE runtime + no-CORS provider → models must load (the fix) ---- */
{
  const { page } = await openApp({ native: true });
  await configure(page, `http://127.0.0.1:${PROVIDER}/v1`, KEY);
  await page.getByRole("button", { name: "فحص الاتصال وجلب النماذج" }).click();
  const ok =
    (await page
      .getByText(/تم الاتصال/)
      .first()
      .waitFor({ timeout: 20000 })
      .then(() => true)
      .catch(() => false)) === true;
  const listed = await page.locator("select, [role='combobox']").count();
  check("native: no-CORS provider, valid key → models load", ok, `comboboxes=${listed}`);
  await page.close();
}

/* ---- A2: NATIVE runtime + bad key → precise unauthorized message ---------- */
{
  const { page } = await openApp({ native: true });
  await configure(page, `http://127.0.0.1:${PROVIDER}/v1`, "sk-wrong");
  await page.getByRole("button", { name: "فحص الاتصال وجلب النماذج" }).click();
  const text = await errorText(page);
  check(
    "native: wrong key → unauthorized (not a CORS/network guess)",
    text.includes("رفض المزوّد المفتاح"),
    text.slice(0, 90),
  );
  await page.close();
}

/* ---- A3: NATIVE runtime + full lab run → report renders ------------------- */
{
  const { page, consoleErrors } = await openApp({ native: true });
  await configure(page, `http://127.0.0.1:${PROVIDER}/v1`, KEY);
  await page.getByRole("button", { name: "فحص الاتصال وجلب النماذج" }).click();
  await page.getByText(/تم الاتصال/).first().waitFor({ timeout: 20000 });
  await page.getByRole("button", { name: "إغلاق" }).click();
  await page.getByRole("textbox", { name: "المادة 1", exact: true }).fill("هيدروكسيد الصوديوم");
  await page.getByRole("textbox", { name: "المادة 2", exact: true }).fill("حمض الهيدروكلوريك");
  await page.getByRole("textbox", { name: "كمية المادة 1" }).fill("500");
  await page.getByRole("textbox", { name: "كمية المادة 2" }).fill("500");
  await page.getByRole("textbox", { name: "المرجع أو المعيار" }).fill("Lexicomp");
  await page.getByRole("textbox", { name: "عمر المريض" }).fill("30");
  await page.getByRole("textbox", { name: "وزن المريض" }).fill("70");
  await page.getByRole("button", { name: "أجرِ التحقق من الإعطاء" }).click();
  const danger = await page
    .getByText("خطر عالٍ")
    .first()
    .waitFor({ timeout: 30000 })
    .then(() => true)
    .catch(() => false);
  check("native: lab run renders the interaction report", danger === true);
  check("native: console clean", consoleErrors.length === 0, consoleErrors[0]?.slice(0, 80) ?? "");
  await page.close();
}

/* ---- B1: WEB runtime + no-CORS provider → NEW actionable message --------- */
{
  const { page } = await openApp({ native: false });
  await configure(page, `http://127.0.0.1:${PROVIDER}/v1`, KEY);
  await page.getByRole("button", { name: "فحص الاتصال وجلب النماذج" }).click();
  const text = await errorText(page);
  const actionable = text.includes("منع الرد") && text.includes("الوسيط المحلي");
  check("web: no-CORS provider → actionable browser-block message", actionable, text.slice(0, 90));
  await page.close();
}

/* ---- B2: WEB runtime + relay → works end to end --------------------------- */
{
  const { page } = await openApp({ native: false });
  await configure(page, `http://127.0.0.1:${RELAY}/v1`, KEY);
  await page.getByRole("button", { name: "فحص الاتصال وجلب النماذج" }).click();
  const ok = await page
    .getByText(/تم الاتصال/)
    .first()
    .waitFor({ timeout: 20000 })
    .then(() => true)
    .catch(() => false);
  check("web: through the local relay → models load", ok === true);
  await page.close();
}

await browser.close();
provider.close();
relay.close();

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
