/**
 * Render smoke test for dist-standalone/pharmacy-lab.html over file://
 * Uses the system Edge (Playwright channel "msedge") so no browser download
 * is needed. Verifies real content + clean console on desktop and mobile
 * viewports, and saves screenshots under screenshots/.
 */
import { mkdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL, URL } from "node:url";
import { chromium } from "playwright";

const target = pathToFileURL(
  fileURLToPath(new URL("../dist-standalone/pharmacy-lab.html", import.meta.url)),
).href;
const shotsDir = fileURLToPath(new URL("../screenshots", import.meta.url));
mkdirSync(shotsDir, { recursive: true });

const viewports = [
  { name: "desktop", width: 1280, height: 800 },
  { name: "mobile", width: 390, height: 844 },
];

const browser = await chromium.launch({ channel: "msedge", headless: true });
const verdicts = [];

for (const viewport of viewports) {
  const page = await browser.newPage({ viewport });
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(String(error)));
  await page.goto(target, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);

  const text = await page.evaluate(() => document.body?.innerText ?? "");
  const horizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
  // Computed-style assertions stand in for eyeballing: they catch a CSS bundle
  // that failed to load (would leave body with default white/Times) and fonts
  // that failed to inline — the two classic single-file regressions.
  const styles = await page.evaluate(() => {
    const body = getComputedStyle(document.body);
    const h1 = document.querySelector("h1");
    const h1Style = h1 ? getComputedStyle(h1) : null;
    const fontsLoaded = [...document.fonts].filter((font) => font.status === "loaded").length;
    return {
      bodyBackground: body.backgroundColor,
      bodyFont: body.fontFamily,
      h1Font: h1Style?.fontFamily ?? "",
      fontsLoaded,
      tabsCount: document.querySelectorAll('[role="tab"]').length,
      inputsCount: document.querySelectorAll("input").length,
    };
  });
  const screenshot = `${shotsDir}/standalone-${viewport.name}.png`;
  await page.screenshot({ path: screenshot, fullPage: true });

  const styledOk =
    styles.bodyBackground === "rgb(247, 242, 230)" &&
    styles.bodyFont.includes("IBM Plex Sans Arabic") &&
    styles.tabsCount === 3 &&
    styles.inputsCount >= 2;

  verdicts.push({
    viewport: viewport.name,
    ok:
      text.includes("مختبر الصيدلي") &&
      text.includes("طاولة المزج") &&
      consoleErrors.length === 0 &&
      pageErrors.length === 0 &&
      !horizontalOverflow &&
      styledOk,
    bodyTextLen: text.length,
    horizontalOverflow,
    consoleErrors,
    pageErrors,
    styles,
    screenshot,
  });
  await page.close();
}

await browser.close();
console.log(JSON.stringify({ target, verdicts }, null, 2));
if (verdicts.some((item) => !item.ok)) process.exit(1);
