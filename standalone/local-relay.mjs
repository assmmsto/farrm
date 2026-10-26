/**
 * Tiny LOCAL CORS relay for using pharmacy-lab.html from a regular browser
 * with providers that don't send CORS headers (e.g. api.river.ai).
 *
 * Why: browsers refuse cross-origin calls that lack Access-Control-Allow-Origin.
 * The APK doesn't need this (it uses native HTTP). This relay is only for the
 * desktop/phone-browser path — it runs on YOUR machine, no cloud, and your key
 * travels only between your browser and this process.
 *
 * Usage:
 *   node standalone/local-relay.mjs           → listens on 0.0.0.0:8787, forwards to https://api.river.ai
 *   TARGET=https://other.ai PORT=9000 node standalone/local-relay.mjs
 *
 * Then in the app settings:
 *   - same computer's browser → base URL: http://127.0.0.1:8787/v1
 *   - phone browser on same Wi-Fi → run `ipconfig` to find your LAN IP, then
 *     base URL: http://192.168.x.x:8787/v1   (keep this machine awake; accept
 *     the Windows Firewall prompt once if it appears)
 */
import { createServer } from "node:http";

const TARGET = (process.env.TARGET || "https://api.river.ai").replace(/\/+$/, "");
const PORT = Number(process.env.PORT || 8787);
const HOP_HEADERS = new Set(["host", "connection", "content-length", "origin", "referer"]);

const server = createServer((req, res) => {
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
    try {
      const headers = {};
      for (const [name, value] of Object.entries(req.headers)) {
        if (HOP_HEADERS.has(name.toLowerCase()) || value === undefined) continue;
        headers[name] = Array.isArray(value) ? value.join(", ") : value;
      }
      const upstream = await fetch(`${TARGET}${req.url}`, {
        method: req.method,
        headers,
        body: chunks.length ? Buffer.concat(chunks) : undefined,
        redirect: "follow",
      });
      const text = await upstream.text();
      console.log(`${req.method} ${req.url} → ${upstream.status} (${text.length}b)`);
      res.writeHead(upstream.status, {
        "content-type": upstream.headers.get("content-type") || "application/json",
      });
      res.end(text);
    } catch (error) {
      console.error("relay error:", error instanceof Error ? error.message : error);
      res.writeHead(502, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { message: "relay failed to reach target" } }));
    }
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`CORS relay listening on http://0.0.0.0:${PORT} → forwarding to ${TARGET}`);
  console.log(`In app settings use:  http://127.0.0.1:${PORT}/v1   (or your LAN IP from a phone)`);
});
