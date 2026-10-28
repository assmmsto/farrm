/**
 * Second audit pass — the *rendering* decisions, not just parsing.
 * Compiles the real normalize.ts and the real report guards, then asserts what
 * a pharmacist would actually see for realistic model answers.
 *
 * Run: node standalone/audit-report.mjs
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const out = mkdtempSync(join(tmpdir(), "audit-report-"));

try {
  execFileSync(
    "npx",
    ["tsc", "src/lib/normalize.ts", "--outDir", out, "--module", "esnext", "--target", "es2022", "--skipLibCheck"],
    { cwd: root, stdio: "pipe", shell: process.platform === "win32" },
  );
  const { parseSeverity, parseLab } = await import(pathToFileURL(join(out, "normalize.js")).href);

  const results = [];
  const check = (name, actual, expected) => {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    results.push({ name, ok, actual, expected });
  };

  /* ---- The two bugs found in pass 1 ---- */
  check("«لا خطر» → none (negation first)", parseSeverity("لا خطر"), "none");
  check("«خطير» → major (full word)", parseSeverity("خطير"), "major");
  check("«بدون خطر» → none", parseSeverity("بدون خطر"), "none");
  check("«لا يوجد خطر» → none", parseSeverity("لا يوجد خطر"), "none");
  check("«غير خطير» → none", parseSeverity("غير خطير"), "none");
  check("«خطر عالٍ» still major", parseSeverity("خطر عالٍ"), "major");
  check("«غير محسوم» → unknown", parseSeverity("غير محسوم"), "unknown");
  check("«لا تداخل» → none", parseSeverity("لا تداخل"), "none");
  check("«مجهول» → unknown", parseSeverity("مجهول"), "unknown");

  /* ---- End-to-end: a dangerous answer must never render as safe ---- */
  const dangerous = parseLab(
    JSON.stringify({
      headline: "لا خطر من الجمع",
      severity: "لا خطر",
      result: "يمكن إعطاؤهما معاً",
      sections: [{ title: "الخلاصة", body: "لا تداخل مهم" }],
      sources: [],
    }),
  );
  check("unreferenced «no risk» parses with severity none", dangerous?.severity, "none");

  /* ---- The guard function itself, extracted verbatim from reports.tsx ---- */
  const reports = readFileSync(resolve(root, "src/components/reports.tsx"), "utf8");
  const fn = reports.match(/function unverifiedSafety[\s\S]*?\n}/)?.[0];
  if (!fn) throw new Error("unverifiedSafety not found in reports.tsx");
  const guardFile = join(out, "guard.mjs");
  writeFileSync(
    guardFile,
    `export ${fn.replace("unverifiedSafety(report: LabReport): boolean", "unverifiedSafety(report)")}`,
  );
  const { unverifiedSafety } = await import(pathToFileURL(guardFile).href);

  check("guard fires on unreferenced no-risk", unverifiedSafety(dangerous), true);

  const highRisk = parseLab(
    JSON.stringify({
      headline: "خطر عالٍ",
      severity: "major",
      result: "لا يُعطى",
      sources: [],
    }),
  );
  check("guard silent on high risk without sources", unverifiedSafety(highRisk), false);

  const sourced = { ...dangerous, sources: ["Lexicomp"] };
  check("guard silent when a source is declared", unverifiedSafety(sourced), false);

  const minorish = parseLab(
    JSON.stringify({ headline: "أثر بسيط", severity: "minor", result: "مراقبة فقط", sources: [] }),
  );
  check("guard silent on minor without reassurance wording", unverifiedSafety(minorish), false);

  const failed = results.filter((r) => !r.ok);
  console.log(JSON.stringify({ total: results.length, failed }, null, 2));
  if (failed.length > 0) process.exitCode = 1;
} finally {
  rmSync(out, { recursive: true, force: true });
}
