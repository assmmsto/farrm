/**
 * Post-build inliner for the standalone bundle.
 *
 * The Vite build already inlined every font/asset into one JS and one CSS file
 * (assetsInlineLimit in standalone/vite.config.ts). Because the html input
 * lives under standalone/, Vite emits it as dist-standalone/standalone/index.html
 * with "../assets/…" references. This script:
 *   1. folds JS + CSS into ONE self-contained HTML file,
 *   2. writes it as dist-standalone/pharmacy-lab.html (browser / file:// use),
 *   3. copies it as capacitor-www/index.html — the Capacitor webDir, so the
 *      Android WebView also loads exactly one file with no asset path issues.
 *
 * Deliberately dependency-free instead of vite-plugin-singlefile: exact same
 * result, zero version-compat risk against the installed Vite major.
 */
import { copyFileSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, URL } from "node:url";

const outDir = fileURLToPath(new URL("../dist-standalone", import.meta.url));

function findIndexHtml() {
  for (const candidate of [join(outDir, "index.html"), join(outDir, "standalone", "index.html")]) {
    try {
      statSync(candidate);
      return candidate;
    } catch {
      // keep looking
    }
  }
  throw new Error(`index.html not found under ${outDir}`);
}

const indexPath = findIndexHtml();
const htmlDir = dirname(indexPath);
let html = readFileSync(indexPath, "utf8");

function escapeScript(source) {
  // A literal "</script>" inside the JS would terminate the inline block early.
  return source.replace(/<\/script/gi, "<\\/script");
}

let inlinedJs = 0;
let inlinedCss = 0;

html = html.replace(
  /<(script|link)\b[^>]*\b(src|href)=["']([^"']+\.(js|css))["'][^>]*>(?:<\/script>)?/gi,
  (tag, element, _attr, url, ext) => {
    const assetPath = resolve(htmlDir, decodeURIComponent(url));
    let source;
    try {
      source = readFileSync(assetPath, "utf8");
    } catch {
      return tag; // leave non-build references (e.g. data: URIs are not matched anyway)
    }
    if (String(ext).toLowerCase() === "js") {
      inlinedJs += 1;
      return `<script type="module">\n${escapeScript(source)}\n</script>`;
    }
    inlinedCss += 1;
    return `<style>\n${source}\n</style>`;
  },
);

if (inlinedJs === 0 || inlinedCss === 0) {
  throw new Error(`inlining incomplete: js=${inlinedJs} css=${inlinedCss}`);
}

const singlePath = join(outDir, "pharmacy-lab.html");
writeFileSync(singlePath, html, "utf8");

// The WebView source: exactly the same single file.
const webviewDir = fileURLToPath(new URL("../capacitor-www", import.meta.url));
mkdirSync(webviewDir, { recursive: true });
copyFileSync(singlePath, join(webviewDir, "index.html"));

const kb = Math.round(statSync(singlePath).size / 1024);
console.log(`[standalone] single file: dist-standalone/pharmacy-lab.html (${kb} KB)`);
console.log(`[standalone] webview copy: capacitor-www/index.html`);
