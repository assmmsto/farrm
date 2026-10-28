import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, X } from "lucide-react";
import { LabReportView, RawAnswer } from "@/components/reports";
import { fieldClass, primaryBtn } from "@/components/ui";
import { runLab } from "@/lib/client-api";
import { arabicError } from "@/lib/messages";
import { parseLab } from "@/lib/normalize";
import { usePharmacy } from "@/lib/pharmacy-store";
import {
  ROUTE_LABEL,
  UNITS,
  asLabInput,
  emptyIngredient,
  emptyPatient,
  ingredientsLabel,
  labInputIssues,
  providerReady,
  type HistoryItem,
  type Ingredient,
  type LabInput,
  type PatientContext,
  type Route,
} from "@/lib/types";

const MAX = 6;
const ROUTES: Route[] = ["oral", "iv_bolus", "iv_infusion", "im", "sc", "rectal", "topical"];

const EXAMPLE: Ingredient[] = [
  { name: "ميترونيدازول", amount: "500", unit: "mg" },
  { name: "ميبندازول", amount: "500", unit: "mg" },
];

/**
 * Every experiment here is administration to a PATIENT, never mixing in a
 * beaker. The whole record stays on ONE compact screen: a single row per
 * substance (quantity + unit inline), a route strip, and one patient line.
 */
export function LabPanel({ seed, onNeedSettings }: { seed: HistoryItem | null; onNeedSettings: () => void }) {
  const provider = usePharmacy((state) => state.provider);
  const addHistory = usePharmacy((state) => state.addHistory);
  const [ingredients, setIngredients] = useState<Ingredient[]>(() => [
    emptyIngredient(),
    emptyIngredient(),
  ]);
  const [route, setRoute] = useState<Route>("oral");
  const [standard, setStandard] = useState("");
  const [patient, setPatient] = useState<PatientContext>(() => emptyPatient());
  const [note, setNote] = useState("");
  const [more, setMore] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shown, setShown] = useState<{ input: LabInput; content: string; model: string } | null>(null);

  useEffect(() => {
    if (!seed || seed.kind !== "lab") return;
    const input = asLabInput(seed.input);
    if (!input) return;
    setIngredients(input.ingredients);
    setRoute(input.route);
    setStandard(input.standard);
    setPatient(input.patient);
    setNote(input.note);
    setShown({ input, content: seed.content, model: seed.model });
    setError(null);
  }, [seed]);

  const draft: LabInput = useMemo(
    () => ({ ingredients, route, standard, patient, note }),
    [ingredients, route, standard, patient, note],
  );

  const issues = labInputIssues(draft);

  function updateIngredient(index: number, patch: Partial<Ingredient>) {
    setIngredients((current) =>
      current.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)),
    );
  }

  async function run() {
    if (pending) return;
    if (issues.length > 0) {
      setError(issues[0] ?? "أكمل البيانات أولاً");
      return;
    }
    if (!providerReady(provider)) {
      setError(arabicError("not_configured"));
      onNeedSettings();
      return;
    }
    const input: LabInput = {
      ingredients: ingredients
        .map((item) => ({ ...item, name: item.name.trim(), amount: item.amount.trim() }))
        .filter((item) => item.name)
        .slice(0, MAX),
      route,
      standard: standard.trim(),
      patient: {
        age: patient.age.trim(),
        weightKg: patient.weightKg.trim(),
        conditions: patient.conditions.trim(),
      },
      note: note.trim(),
    };
    setPending(true);
    setError(null);
    const result = await runLab(provider, input);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setShown({ input, content: result.content, model: provider.model });
    addHistory({
      id: crypto.randomUUID(),
      kind: "lab",
      title: ingredientsLabel(input.ingredients),
      createdAt: Date.now(),
      model: provider.model,
      input,
      content: result.content,
    });
  }

  const report = shown ? parseLab(shown.content) : null;

  return (
    <div className="flex flex-col gap-3">
      {/* One card, one screen. */}
      <div className="flex flex-col gap-3 rounded-2xl border border-line bg-card p-3">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-base font-semibold">إعطاء المريض</h2>
          <button
            type="button"
            className="text-xs font-medium text-muted underline underline-offset-4"
            onClick={() => {
              setIngredients(EXAMPLE);
              setRoute("oral");
              setStandard("نشرة الدواء");
              setPatient({ age: "30", weightKg: "70", conditions: "" });
              setNote("");
            }}
          >
            مثال
          </button>
        </div>

        {/* Substances: one tight row each; unit sits inside the quantity box. */}
        <div className="flex flex-col gap-2">
          {ingredients.map((item, index) => (
            <div key={index} className="flex min-w-0 items-center gap-1.5">
              <input
                className={`${fieldClass} min-w-0 flex-1`}
                dir="auto"
                aria-label={`المادة ${index + 1}`}
                placeholder={index === 0 ? "المادة أو الدواء" : index === 1 ? "المادة الثانية" : "مادة أخرى"}
                value={item.name}
                autoComplete="off"
                spellCheck={false}
                onChange={(event) => updateIngredient(index, { name: event.target.value })}
              />
              <div className="flex w-[6.5rem] shrink-0 overflow-hidden rounded-xl border border-line bg-card">
                <input
                  className="min-w-0 flex-1 bg-transparent px-2 py-2 text-center text-base tabular-nums outline-none"
                  dir="ltr"
                  inputMode="decimal"
                  aria-label={`كمية المادة ${index + 1}`}
                  placeholder="500"
                  value={item.amount}
                  onChange={(event) => updateIngredient(index, { amount: event.target.value })}
                />
                <select
                  className="shrink-0 border-s border-line bg-paper-deep px-1 text-xs font-medium outline-none"
                  aria-label={`وحدة المادة ${index + 1}`}
                  value={item.unit}
                  onChange={(event) =>
                    updateIngredient(index, { unit: event.target.value as Ingredient["unit"] })
                  }
                >
                  {UNITS.map((unit) => (
                    <option key={unit} value={unit}>
                      {unit}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                className="grid size-9 shrink-0 place-items-center rounded-lg text-muted disabled:opacity-30"
                aria-label={`حذف المادة ${index + 1}`}
                disabled={ingredients.length <= 2}
                onClick={() => setIngredients((current) => current.filter((_, i) => i !== index))}
              >
                <X className="size-4" />
              </button>
            </div>
          ))}
        </div>

        {ingredients.length < MAX ? (
          <button
            type="button"
            className="-mt-1 flex items-center gap-1 self-start text-xs font-medium text-herb"
            onClick={() => setIngredients((current) => [...current, emptyIngredient()])}
          >
            <Plus className="size-3.5" />
            مادة أخرى
          </button>
        ) : null}

        {/* Route: a compact strip, not a dropdown window. */}
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="طريق الإعطاء">
          {ROUTES.map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={route === item}
              className={
                route === item
                  ? "rounded-full bg-herb px-3 py-1.5 text-xs font-semibold text-paper"
                  : "rounded-full border border-line px-3 py-1.5 text-xs font-medium text-ink"
              }
              onClick={() => setRoute(item)}
            >
              {ROUTE_LABEL[item]}
            </button>
          ))}
        </div>

        {/* Reference standard + patient, one dense line each. */}
        <input
          className={fieldClass}
          dir="auto"
          aria-label="المرجع أو المعيار"
          placeholder="المعيار المرجعي (نشرة الدواء / BNF / Lexicomp)"
          value={standard}
          onChange={(event) => setStandard(event.target.value)}
        />
        <div className="flex flex-wrap items-center gap-2">
          <input
            className={`${fieldClass} min-w-0 flex-1 basis-20 text-center tabular-nums`}
            dir="ltr"
            inputMode="numeric"
            aria-label="عمر المريض"
            placeholder="عمر"
            value={patient.age}
            onChange={(event) => setPatient({ ...patient, age: event.target.value })}
          />
          <input
            className={`${fieldClass} min-w-0 flex-1 basis-20 text-center tabular-nums`}
            dir="ltr"
            inputMode="decimal"
            aria-label="وزن المريض"
            placeholder="وزن"
            value={patient.weightKg}
            onChange={(event) => setPatient({ ...patient, weightKg: event.target.value })}
          />
          <button
            type="button"
            className="shrink-0 rounded-lg border border-line px-3 py-2 text-xs font-medium text-muted"
            aria-expanded={more}
            onClick={() => setMore((value) => !value)}
          >
            {more ? "إخفاء" : "حالات"}
          </button>
        </div>

        {more ? (
          <div className="flex flex-col gap-2">
            <input
              className={fieldClass}
              dir="auto"
              aria-label="حالات طبية"
              placeholder="حمل، قصور كلوي، أدوية أخرى…"
              value={patient.conditions}
              onChange={(event) => setPatient({ ...patient, conditions: event.target.value })}
            />
            <textarea
              className={`${fieldClass} min-h-16 py-2`}
              dir="auto"
              aria-label="ملاحظة إضافية"
              maxLength={500}
              placeholder="ملاحظة إضافية"
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </div>
        ) : null}

        <button
          type="button"
          className={primaryBtn}
          disabled={pending || issues.length > 0}
          onClick={() => void run()}
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : null}
          {pending ? "يُجرى التحقق…" : "تحقّق من الإعطاء"}
        </button>

        {issues.length > 0 ? (
          <p className="text-xs leading-relaxed text-muted" aria-live="polite">
            {issues.join(" • ")}
          </p>
        ) : (
          <p className="text-xs text-herb">البيانات مكتملة — سيُقيَّم الخطر على المريض.</p>
        )}

        {error ? (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}
      </div>

      <div aria-live="polite">
        {pending ? <p className="text-sm text-muted">يُكتب التقرير. قد يأخذ ذلك نصف دقيقة.</p> : null}
        {shown && report ? (
          <LabReportView
            report={report}
            compounds={[ingredientsLabel(shown.input.ingredients)]}
            model={shown.model}
          />
        ) : null}
        {shown && !report ? <RawAnswer content={shown.content} /> : null}
      </div>
    </div>
  );
}
