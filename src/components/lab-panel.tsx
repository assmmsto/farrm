import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, X } from "lucide-react";
import { LabReportView, RawAnswer } from "@/components/reports";
import { fieldClass, primaryBtn, quietBtn } from "@/components/ui";
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
 * beaker. So the run is blocked until the pharmacist states the dose of every
 * ingredient, the route, the reference standard and the patient's age.
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
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-4 rounded-2xl border border-line bg-card p-4">
        <div>
          <h2 className="text-lg font-semibold">طاولة إعطاء المريض</h2>
          <p className="text-sm text-muted">
            كل تجربة هنا إعطاء لمريض فعلي. أدخل الكمية وطريق الإعطاء، ثم اقرأ التقرير.
          </p>
        </div>

        {/* 1) Substances + mandatory dose */}
        <div className="flex flex-col gap-2">
          {ingredients.map((item, index) => (
            <div key={index} className="flex items-end gap-2">
              <span className="mb-1 grid size-9 shrink-0 place-items-center rounded-xl bg-herb-soft text-sm font-semibold text-herb tabular-nums">
                {index + 1}
              </span>
              <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs font-medium text-muted">
                المادة
                <input
                  className={fieldClass}
                  dir="auto"
                  aria-label={`المادة ${index + 1}`}
                  placeholder={index === 0 ? "ميترونيدازول" : index === 1 ? "ميبندازول" : "مادة أخرى"}
                  value={item.name}
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(event) => updateIngredient(index, { name: event.target.value })}
                />
              </label>
              <label className="flex w-24 flex-col gap-1 text-xs font-medium text-muted">
                الكمية <span className="text-danger">*</span>
                <input
                  className={`${fieldClass} text-center tabular-nums`}
                  dir="ltr"
                  inputMode="decimal"
                  aria-label={`كمية المادة ${index + 1}`}
                  placeholder="500"
                  value={item.amount}
                  onChange={(event) => updateIngredient(index, { amount: event.target.value })}
                />
              </label>
              <label className="flex w-20 flex-col gap-1 text-xs font-medium text-muted">
                الوحدة
                <select
                  className={fieldClass}
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
              </label>
              <button
                type="button"
                className="mb-1 grid size-11 shrink-0 place-items-center rounded-xl border border-line text-muted disabled:opacity-40"
                aria-label={`حذف المادة ${index + 1}`}
                disabled={ingredients.length <= 2}
                onClick={() => setIngredients((current) => current.filter((_, i) => i !== index))}
              >
                <X className="size-4" />
              </button>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={quietBtn}
            disabled={ingredients.length >= MAX}
            onClick={() => setIngredients((current) => [...current, emptyIngredient()])}
          >
            <Plus className="size-4" />
            أضف مادة
          </button>
          <button
            type="button"
            className={quietBtn}
            onClick={() => {
              setIngredients(EXAMPLE);
              setRoute("oral");
              setStandard("نشرة الدواء");
              setPatient({ age: "30", weightKg: "70", conditions: "" });
              setNote("");
            }}
          >
            مثال: ميترونيدازول + ميبندازول
          </button>
        </div>

        {/* 2) Route + standard */}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm font-medium">
            طريق الإعطاء <span className="text-danger">*</span>
            <select
              className={fieldClass}
              aria-label="طريق الإعطاء"
              value={route}
              onChange={(event) => setRoute(event.target.value as Route)}
            >
              {ROUTES.map((item) => (
                <option key={item} value={item}>
                  {ROUTE_LABEL[item]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            المرجع/المعيار <span className="text-danger">*</span>
            <input
              className={fieldClass}
              dir="auto"
              aria-label="المرجع أو المعيار"
              placeholder="نشرة الدواء / BNF / Lexicomp"
              value={standard}
              onChange={(event) => setStandard(event.target.value)}
            />
          </label>
        </div>

        {/* 3) Patient context */}
        <fieldset className="flex flex-col gap-3 rounded-xl bg-paper-deep px-3 py-3">
          <legend className="px-1 text-sm font-semibold">بيانات المريض</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm font-medium">
              العمر (سنوات) <span className="text-danger">*</span>
              <input
                className={`${fieldClass} tabular-nums`}
                dir="ltr"
                inputMode="numeric"
                aria-label="عمر المريض"
                placeholder="30"
                value={patient.age}
                onChange={(event) => setPatient({ ...patient, age: event.target.value })}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">
              الوزن (كغ)
              <input
                className={`${fieldClass} tabular-nums`}
                dir="ltr"
                inputMode="decimal"
                aria-label="وزن المريض"
                placeholder="70"
                value={patient.weightKg}
                onChange={(event) => setPatient({ ...patient, weightKg: event.target.value })}
              />
            </label>
          </div>
          <label className="flex flex-col gap-1 text-sm font-medium">
            حالات وملاحظات طبية
            <input
              className={fieldClass}
              dir="auto"
              aria-label="حالات طبية"
              placeholder="حمل، قصور كلوي، أدوية أخرى…"
              value={patient.conditions}
              onChange={(event) => setPatient({ ...patient, conditions: event.target.value })}
            />
          </label>
        </fieldset>

        <label className="flex flex-col gap-1 text-sm font-medium" htmlFor="lab-note">
          ملاحظة إضافية
          <textarea
            id="lab-note"
            className={`${fieldClass} min-h-20 py-2`}
            dir="auto"
            maxLength={500}
            placeholder="أي معلومة تؤثر على القرار"
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </label>

        <button
          type="button"
          className={primaryBtn}
          disabled={pending || issues.length > 0}
          onClick={() => void run()}
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : null}
          {pending ? "يُجرى التحقق…" : "أجرِ التحقق من الإعطاء"}
        </button>

        {issues.length > 0 ? (
          <ul className="flex flex-col gap-1 rounded-xl bg-brass-soft px-3 py-2 text-sm text-ink" aria-live="polite">
            {issues.map((issue) => (
              <li key={issue}>• {issue}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-herb">البيانات مكتملة — سيُقيَّم الخطر على المريض بهذه الجرعات والطريق.</p>
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
