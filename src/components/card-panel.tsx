import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { CardReportView, RawAnswer } from "@/components/reports";
import { fieldClass, primaryBtn } from "@/components/ui";
import { runCard } from "@/lib/client-api";
import { arabicError } from "@/lib/messages";
import { parseCard } from "@/lib/normalize";
import { usePharmacy } from "@/lib/pharmacy-store";
import { asCardInput, providerReady, type CardInput, type HistoryItem } from "@/lib/types";

export function CardPanel({ seed, onNeedSettings }: { seed: HistoryItem | null; onNeedSettings: () => void }) {
  const provider = usePharmacy((state) => state.provider);
  const addHistory = usePharmacy((state) => state.addHistory);
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shown, setShown] = useState<{ input: CardInput; content: string; model: string } | null>(null);

  useEffect(() => {
    if (!seed || seed.kind !== "card") return;
    const input = asCardInput(seed.input);
    if (!input) return;
    setName(input.name);
    setShown({ input, content: seed.content, model: seed.model });
    setError(null);
  }, [seed]);

  async function run() {
    if (pending) return; // Enter key path must respect the in-flight request too
    const cleaned = name.trim();
    if (!cleaned) {
      setError("اكتب اسم الدواء أو المركب.");
      return;
    }
    if (!providerReady(provider)) {
      setError(arabicError("not_configured"));
      onNeedSettings();
      return;
    }
    const input = { name: cleaned };
    setPending(true);
    setError(null);
    const result = await runCard(provider, input);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setShown({ input, content: result.content, model: provider.model });
    addHistory({
      id: crypto.randomUUID(),
      kind: "card",
      title: cleaned,
      createdAt: Date.now(),
      model: provider.model,
      input,
      content: result.content,
    });
  }

  const report = shown ? parseCard(shown.content) : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-4 rounded-2xl border border-line bg-card p-4">
        <div>
          <h2 className="text-lg font-semibold">بطاقة الدواء</h2>
          <p className="text-sm text-muted">اسم الدواء أو المركب. البطاقة تغطي التركيب، الموانع، المعقدات، والجرعة.</p>
        </div>
        <label className="flex flex-col gap-2 text-sm font-medium" htmlFor="drug-name">
          الاسم
          <input
            id="drug-name"
            className={fieldClass}
            dir="auto"
            autoComplete="off"
            spellCheck={false}
            placeholder="مثال: ديكلوفيناك أو أموكسيسيلين"
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void run();
              }
            }}
          />
        </label>
        <button type="button" className={primaryBtn} disabled={pending} onClick={() => void run()}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : null}
          {pending ? "تُستخرج البطاقة…" : "استخرج البطاقة"}
        </button>
        {error ? (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}
      </div>
      <div aria-live="polite">
        {pending ? <p className="text-sm text-muted">تُرتَّب البطاقة. قد يأخذ ذلك نصف دقيقة.</p> : null}
        {shown && report ? <CardReportView key={shown.content} report={report} query={shown.input.name} model={shown.model} /> : null}
        {shown && !report ? <RawAnswer content={shown.content} /> : null}
      </div>
    </div>
  );
}
