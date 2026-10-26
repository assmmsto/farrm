export type Severity = "major" | "moderate" | "minor" | "none" | "unknown";

export type LabReport = {
  assumption: string;
  headline: string;
  severity: Severity;
  result: string;
  sections: { title: string; body: string }[];
  uncertainties: string;
};

export type MineralComplex = {
  partner: string;
  whatHappens: string;
  advice: string;
};

export type DrugInteraction = {
  with: string;
  severity: Severity;
  effect: string;
};

export type Dosing = {
  perKgMin: number | null;
  perKgUsual: number | null;
  perKgMax: number | null;
  frequency: string;
  route: string;
  adultUsual: string;
  pediatricNote: string;
  maxDaily: string;
  adjustments: string;
  notes: string;
};

export type CardReport = {
  assumption: string;
  nameAr: string;
  nameLat: string;
  drugClass: string;
  whatItIs: string;
  usedFor: string[];
  chemicalComposition: string;
  howPrescribed: string;
  kinetics: string;
  contraindications: string[];
  foodInteractions: string[];
  mineralComplexes: MineralComplex[];
  drugInteractions: DrugInteraction[];
  administrationWarnings: string[];
  dosing: Dosing;
  uncertainties: string;
};

const EAST = "٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹";
const WEST = "01234567890123456789";

export function toWesternDigits(input: string): string {
  return input.replace(/[٠-٩۰-۹]/g, (digit) => {
    const index = EAST.indexOf(digit);
    return index >= 0 ? (WEST[index] ?? digit) : digit;
  });
}

export function parseJsonLoose(text: string): unknown {
  const trimmed = text.trim().replace(/^\uFEFF/, "");
  const tryParse = (value: string): unknown => {
    try {
      return JSON.parse(value) as unknown;
    } catch {
      return undefined;
    }
  };
  const direct = tryParse(trimmed);
  if (direct !== undefined) return direct;
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) {
    const inner = tryParse(fence[1].trim());
    if (inner !== undefined) return inner;
  }
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    const sliced = tryParse(trimmed.slice(start, end + 1));
    if (sliced !== undefined) return sliced;
  }
  return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function asString(value: unknown, max = 4000): string {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value !== "string") return "";
  return value.replace(/\u0000/g, "").trim().slice(0, max);
}

export function asList(value: unknown, max = 12): string[] {
  if (typeof value === "string" && value.trim()) return [asString(value)];
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    if (out.length >= max) break;
    if (typeof item === "string" && item.trim()) {
      out.push(asString(item));
      continue;
    }
    const rec = asRecord(item);
    if (!rec) continue;
    const text = asString(rec.text ?? rec.body ?? rec.effect ?? rec.name ?? rec.item);
    if (text) out.push(text);
  }
  return out;
}

export function parseSeverity(value: unknown): Severity {
  if (typeof value !== "string") return "unknown";
  const v = value.trim().toLowerCase();
  const map: Record<string, Severity> = {
    major: "major",
    severe: "major",
    high: "major",
    serious: "major",
    contraindicated: "major",
    moderate: "moderate",
    medium: "moderate",
    minor: "minor",
    low: "minor",
    mild: "minor",
    none: "none",
    "no interaction": "none",
    insignificant: "none",
    unknown: "unknown",
  };
  if (map[v]) return map[v];
  if (v.includes("خطر") || v.includes("شديد") || v.includes("مانع")) return "major";
  if (v.includes("متوسط")) return "moderate";
  if (v.includes("بسيط") || v.includes("طفيف")) return "minor";
  if (v.includes("لا يوجد") || v.includes("لا تداخل")) return "none";
  return "unknown";
}

function asDose(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return clampDose(value);
  if (typeof value !== "string") return null;
  const cleaned = toWesternDigits(value).trim().replace(",", ".");
  const match = cleaned.match(/(\d+(?:\.\d+)?)/);
  if (!match?.[1]) return null;
  return clampDose(Number(match[1]));
}

function clampDose(value: number): number | null {
  if (!Number.isFinite(value) || value <= 0 || value > 500) return null;
  return Math.round(value * 1000) / 1000;
}

function emptyDosing(): Dosing {
  return {
    perKgMin: null,
    perKgUsual: null,
    perKgMax: null,
    frequency: "",
    route: "",
    adultUsual: "",
    pediatricNote: "",
    maxDaily: "",
    adjustments: "",
    notes: "",
  };
}

function parseDosing(value: unknown): Dosing {
  const rec = asRecord(value);
  if (!rec) return emptyDosing();
  return {
    perKgMin: asDose(rec.perKgMin),
    perKgUsual: asDose(rec.perKgUsual),
    perKgMax: asDose(rec.perKgMax),
    frequency: asString(rec.frequency, 240),
    route: asString(rec.route, 240),
    adultUsual: asString(rec.adultUsual, 600),
    pediatricNote: asString(rec.pediatricNote, 800),
    maxDaily: asString(rec.maxDaily, 400),
    adjustments: asString(rec.adjustments, 800),
    notes: asString(rec.notes, 800),
  };
}

function parseMinerals(value: unknown): MineralComplex[] {
  if (!Array.isArray(value)) return [];
  const out: MineralComplex[] = [];
  for (const item of value) {
    if (out.length >= 8) break;
    if (typeof item === "string" && item.trim()) {
      out.push({ partner: asString(item, 200), whatHappens: "", advice: "" });
      continue;
    }
    const rec = asRecord(item);
    if (!rec) continue;
    const partner = asString(rec.partner ?? rec.with ?? rec.mineral, 200);
    const whatHappens = asString(rec.whatHappens ?? rec.effect ?? rec.body, 800);
    const advice = asString(rec.advice ?? rec.recommendation, 400);
    if (!partner && !whatHappens) continue;
    out.push({ partner: partner || "معقد", whatHappens, advice });
  }
  return out;
}

function parseInteractions(value: unknown): DrugInteraction[] {
  if (!Array.isArray(value)) return [];
  const out: DrugInteraction[] = [];
  for (const item of value) {
    if (out.length >= 10) break;
    if (typeof item === "string" && item.trim()) {
      out.push({ with: asString(item, 200), severity: "unknown", effect: "" });
      continue;
    }
    const rec = asRecord(item);
    if (!rec) continue;
    const withDrug = asString(rec.with ?? rec.drug ?? rec.name, 200);
    const effect = asString(rec.effect ?? rec.body ?? rec.whatHappens, 800);
    if (!withDrug && !effect) continue;
    out.push({
      with: withDrug || "دواء آخر",
      severity: parseSeverity(rec.severity),
      effect,
    });
  }
  return out;
}

export function parseLab(content: string): LabReport | null {
  const rec = asRecord(parseJsonLoose(content));
  if (!rec) return null;
  const sections: { title: string; body: string }[] = [];
  if (Array.isArray(rec.sections)) {
    for (const item of rec.sections) {
      if (sections.length >= 12) break;
      const row = asRecord(item);
      if (!row) continue;
      const title = asString(row.title, 160);
      const body = asString(row.body, 5000);
      if (!title && !body) continue;
      sections.push({ title: title || "ملاحظة", body });
    }
  }
  const result = asString(rec.result, 4000);
  let headline = asString(rec.headline, 240);
  if (!headline) headline = result.slice(0, 180);
  if (!headline && sections.length === 0) return null;
  return {
    assumption: asString(rec.assumption, 500),
    headline: headline || "نتيجة التجربة",
    severity: parseSeverity(rec.severity),
    result: result || headline,
    sections,
    uncertainties: asString(rec.uncertainties, 2000),
  };
}

export function parseCard(content: string): CardReport | null {
  const rec = asRecord(parseJsonLoose(content));
  if (!rec) return null;
  const dosing = parseDosing(rec.dosing);
  const report: CardReport = {
    assumption: asString(rec.assumption, 500),
    nameAr: asString(rec.nameAr, 160),
    nameLat: asString(rec.nameLat, 160),
    drugClass: asString(rec.drugClass, 240),
    whatItIs: asString(rec.whatItIs, 2000),
    usedFor: asList(rec.usedFor),
    chemicalComposition: asString(rec.chemicalComposition, 2000),
    howPrescribed: asString(rec.howPrescribed, 2000),
    kinetics: asString(rec.kinetics, 2000),
    contraindications: asList(rec.contraindications),
    foodInteractions: asList(rec.foodInteractions),
    mineralComplexes: parseMinerals(rec.mineralComplexes),
    drugInteractions: parseInteractions(rec.drugInteractions),
    administrationWarnings: asList(rec.administrationWarnings),
    dosing,
    uncertainties: asString(rec.uncertainties, 2000),
  };
  const hasContent = Boolean(
    report.nameAr ||
      report.nameLat ||
      report.whatItIs ||
      report.usedFor.length ||
      report.chemicalComposition ||
      report.howPrescribed ||
      report.kinetics ||
      report.contraindications.length ||
      report.foodInteractions.length ||
      report.mineralComplexes.length ||
      report.drugInteractions.length ||
      report.administrationWarnings.length ||
      report.dosing.perKgUsual ||
      report.dosing.adultUsual,
  );
  return hasContent ? report : null;
}

export function parseWeight(raw: string): number | null {
  const cleaned = toWesternDigits(raw).trim().replace(",", ".");
  if (!cleaned) return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value <= 0 || value > 400) return null;
  return Math.round(value * 100) / 100;
}

export function formatNum(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
}

export function formatMg(value: number): string {
  const digits = value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(value);
}
