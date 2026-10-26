import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1200, height: 630 },
  deviceScaleFactor: 2,
});
await page.goto("file:///workspace/.grok/card.html");
await page.evaluate(() => document.fonts.ready);
const metrics = await page.evaluate(() => {
  const name = document.getElementById("name").getBoundingClientRect();
  const lock = document.getElementById("lock").getBoundingClientRect();
  const c = document.createElement("canvas").getContext("2d");
  c.font = "700 176px Amiri";
  return {
    name: { x: name.x, y: name.y, w: name.width, h: name.height },
    lock: { y: lock.y, h: lock.height, bottom: lock.bottom },
    canvasW: c.measureText("مختبر الصيدلي").width,
    text: document.getElementById("name").textContent,
  };
});
console.log(JSON.stringify(metrics));
await page.screenshot({
  path: "/workspace/.grok/og-render.png",
  type: "png",
  clip: { x: 0, y: 0, width: 1200, height: 630 },
});
await browser.close();
