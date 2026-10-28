export type ProviderConfig = {
  baseUrl: string;
  apiKey: string;
  model: string;
  models: string[];
  verified: boolean;
};

/** How the mixture reaches the patient. Never "in a beaker" — this app treats
 *  every experiment as administration to a patient. */
export type Route = "oral" | "iv_bolus" | "iv_infusion" | "im" | "sc" | "rectal" | "topical";

export const ROUTE_LABEL: Record<Route, string> = {
  oral: "فموي",
  iv_bolus: "وريدي — بلعة",
  iv_infusion: "وريدي — تسريب",
  im: "عضلي",
  sc: "تحت الجلد",
  rectal: "مستقيمي",
  topical: "موضعي",
};

/**
 * One ingredient as the pharmacist actually prescribes it: a substance, a
 * quantity and its unit. Nothing about the patient's risk can be judged without
 * a dose, so a quantity is mandatory for every ingredient.
 */
export type Ingredient = {
  name: string;
  /** Dose per administration, e.g. "500". Kept as text so "0.5" survives. */
  amount: string;
  unit: "mg" | "g" | "mcg" | "mL" | "IU" | "%";
};

export const UNITS: Ingredient["unit"][] = ["mg", "g", "mcg", "mL", "IU", "%"];

/** Patient context — required, because pediatric weight and renal function
 *  change the answer completely. */
export type PatientContext = {
  age: string;
  weightKg: string;
  /** Free text: pregnancy, renal/hepatic impairment, other drugs… */
  conditions: string;
};

export type LabInput = {
  ingredients: Ingredient[];
  route: Route;
  /** Manufacturer's standard reference for each ingredient, e.g. "نشرة الدواء". */
  standard: string;
  patient: PatientContext;
  note: string;
};

export type CardInput = {
  name: string;
};

export type HistoryItem = {
  id: string;
  kind: "lab" | "card";
  title: string;
  createdAt: number;
  model: string;
  input: LabInput | CardInput;
  content: string;
};

export const emptyProvider: ProviderConfig = {
  baseUrl: "",
  apiKey: "",
  model: "",
  models: [],
  verified: false,
};

export function providerReady(provider: ProviderConfig): boolean {
  return Boolean(
    provider.verified && provider.baseUrl.trim() && provider.apiKey.trim() && provider.model.trim(),
  );
}

export function emptyPatient(): PatientContext {
  return { age: "", weightKg: "", conditions: "" };
}

export function emptyIngredient(): Ingredient {
  return { name: "", amount: "", unit: "mg" };
}

/**
 * Completeness gate. An experiment is only runnable when the patient can
 * actually be harmed by an answer: at least two named substances, a dose for
 * each, a route, a declared standard and the patient's age.
 */
export function labInputIssues(input: LabInput): string[] {
  const issues: string[] = [];
  const named = input.ingredients.filter((item) => item.name.trim());

  if (named.length < 2) issues.push("اكتب مادتين على الأقل");

  if (named.some((item) => !item.amount.trim())) issues.push("أدخل كمية (جرعة) لكل مادة");

  if (named.some((item) => item.amount.trim() && !/^\d+(?:[.,]\d+)?$/.test(item.amount.trim()))) {
    issues.push("الكمية يجب أن تكون رقماً فقط");
  }

  if (!input.route) issues.push("اختر طريق الإعطاء");

  if (!input.standard.trim()) issues.push("حدّد المعيار المرجعي (نشرة الدواء أو مرجع)");

  if (!input.patient.age.trim()) issues.push("أدخل عمر المريض");

  if (!/^\d+$/.test(input.patient.age.trim())) issues.push("العمر يجب أن يكون رقماً بالسنوات");

  if (input.patient.weightKg.trim() && !/^\d+(?:[.,]\d+)?$/.test(input.patient.weightKg.trim())) {
    issues.push("الوزن يجب أن يكون رقماً");
  }

  return issues;
}

export function asLabInput(input: LabInput | CardInput): LabInput | null {
  if (!("ingredients" in input) || !Array.isArray(input.ingredients)) return null;
  const ingredients = input.ingredients
    .filter((item): item is Ingredient => Boolean(item) && typeof item === "object")
    .slice(0, 6);
  if (ingredients.length < 2) return null;
  const patient =
    "patient" in input && input.patient && typeof input.patient === "object"
      ? input.patient
      : emptyPatient();
  return {
    ingredients,
    route: "route" in input && input.route ? input.route : "oral",
    standard: "standard" in input && typeof input.standard === "string" ? input.standard : "",
    patient,
    note: "note" in input && typeof input.note === "string" ? input.note : "",
  };
}

export function asCardInput(input: LabInput | CardInput): CardInput | null {
  if (!("name" in input) || typeof input.name !== "string" || !input.name.trim()) return null;
  return { name: input.name };
}

/** Human-readable one-liner, e.g. «مترونيدازول 500 mg + ميبندازول 500 mg». */
export function ingredientsLabel(ingredients: Ingredient[]): string {
  return ingredients
    .filter((item) => item.name.trim())
    .map((item) => `${item.name.trim()} ${item.amount.trim()} ${item.unit}`.trim())
    .join(" + ");
}
