/**
 * Unit-level audit of the report parser — runs the REAL src/lib/normalize.ts.
 *
 * Compiles that one module with the project's tsc into a temp folder, imports
 * it, and asserts the mapping rules that decide what the pharmacist sees.
 *
 * Run: node standalone/audit-parser.mjs
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const out = mkdtempSync(join(tmpdir(), "audit-parser-"));

try {
  execFileSync(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["tsc", "src/lib/normalize.ts", "--outDir", out, "--module", "esnext", "--target", "es2022", "--skipLibCheck"],
    { cwd: root, stdio: "pipe", shell: process.platform === "win32" },
  );

  const mod = await import(pathToFileURL(join(out, "normalize.js")).href);
  const { parseSeverity, parseLab } = mod;

  const results = [];
  const check = (name, actual, expected) => {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    results.push({ name, ok, actual, expected });
  };

  /* ---- 1. Severity mapping across the vocabulary models really emit ---- */
  check("English major", parseSeverity("major"), "major");
  check("English 'no interaction'", parseSeverity("no interaction"), "none");
  check("Arabic «عالية»", parseSeverity("عالية"), "major");
  check("Arabic «مرتفع»", parseSeverity("مرتفع"), "major");
  check("Arabic «لا يوجد تداخل»", parseSeverity("لا يوجد تداخل"), "none");
  check("Arabic «غير محسوم»", parseSeverity("غير محسوم"), "unknown");
  check("Arabic «بسيط»", parseSeverity("بسيط"), "minor");
  check("Arabic «خطير»", parseSeverity("خطير"), "major");

  /* ---- 2. The dangerous trap: «لا خطر» contains «خطر» ---- */
  check("«لا خطر» → none (negation checked first)", parseSeverity("لا خطر"), "none");

  /* ---- 3. parseLab robustness on real model shapes ---- */
  const good = parseLab(
    JSON.stringify({
      headline: "خطر عالٍ",
      severity: "major",
      result: "لا يُعطى",
      sections: [{ title: "الجرعة", body: "عالية" }],
      sources: ["Lexicomp"],
      confidence: "high",
    }),
  );
  check("valid JSON parses", good !== null, true);
  check("severity kept", good?.severity, "major");
  check("sources kept", good?.sources, ["Lexicomp"]);
  check("confidence kept", good?.confidence, "high");

  const fenced = parseLab('```json\n{"headline":"س","severity":"moderate","result":"ر"}\n```');
  check("fenced JSON parses", fenced?.headline, "س");

  const trailing = parseLab('{"headline":"س","result":"ر"}\n\nهذه إضافة من النموذج');
  check("trailing prose still parses", trailing?.headline, "س");

  const braces = parseLab(
    JSON.stringify({ headline: "استخدم الصيغة {x} في الحساب", severity: "minor", result: "ر" }),
  );
  check("braces inside strings survive", braces?.headline, "استخدم الصيغة {x} في الحساب");

  check("plain prose → null", parseLab("لا يوجد خطر إطلاقاً"), null);

  const failed = results.filter((r) => !r.ok);
  console.log(JSON.stringify({ total: results.length, failed }, null, 2));
  if (failed.length > 0) process.exitCode = 1;
} finally {
  rmSync(out, { recursive: true, force: true });
}
