import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { FlaskConical, Pill, ScrollText, Settings } from "lucide-react";
import { AboutDeveloper } from "@/components/about-developer";
import { CardPanel } from "@/components/card-panel";
import { HistoryPanel } from "@/components/history-panel";
import { LabPanel } from "@/components/lab-panel";
import { SettingsDialog } from "@/components/settings-dialog";
import { usePharmacy } from "@/lib/pharmacy-store";
import { providerReady, type HistoryItem } from "@/lib/types";

export type Tab = "lab" | "card" | "history";

const tabs: { id: Tab; label: string; icon: typeof FlaskConical }[] = [
  { id: "lab", label: "المختبر", icon: FlaskConical },
  { id: "card", label: "البطاقة", icon: Pill },
  { id: "history", label: "السجل", icon: ScrollText },
];

/**
 * The whole app shell. Kept router-free on purpose: the TanStack route at
 * src/routes/index.tsx (hosted preview) and standalone/main.tsx (single file +
 * APK) both mount this component unchanged.
 */
export function Home() {
  const hydrate = usePharmacy((state) => state.hydrate);
  const provider = usePharmacy((state) => state.provider);
  const historyCount = usePharmacy((state) => state.history.length);
  const [tab, setTab] = useState<Tab>("lab");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [seed, setSeed] = useState<HistoryItem | null>(null);
  const ready = providerReady(provider);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  function onTabListKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const order = tabs.map((item) => item.id);
    const index = order.indexOf(tab);
    let next = -1;
    // RTL pattern: ArrowLeft advances forward, ArrowRight goes back.
    if (event.key === "ArrowLeft") next = (index + 1) % order.length;
    else if (event.key === "ArrowRight") next = (index - 1 + order.length) % order.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = order.length - 1;
    if (next === -1) return;
    event.preventDefault();
    setTab(order[next] ?? "lab");
    tabRefs.current[next]?.focus();
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-5 px-4 pt-6 pb-24">
      <header className="flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-herb text-card">
            <FlaskConical className="size-6" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-semibold leading-tight">مختبر الصيدلي</h1>
            <p className="text-sm text-muted">ادمج المركبات واقرأ النتيجة مع تقرير كامل، أو افتح بطاقة دواء.</p>
          </div>
          <AboutDeveloper />
        </div>
        <button type="button" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-line bg-card px-4 text-sm font-medium" onClick={() => setSettingsOpen(true)}>
          <Settings className="size-4 shrink-0" aria-hidden />
          <span className="truncate" dir="ltr">
            {ready ? provider.model : "إعداد المزوّد"}
          </span>
        </button>
      </header>

      <p className="rounded-2xl border border-line bg-card px-4 py-3 text-sm text-pretty">
        <span className="font-semibold">تنبيه. </span>
        مرجع مساعد للصيدلي، وليس بديلاً عن النشرة أو المرجع المعتمد أو حكمك المهني. الجواب من النموذج الذي تختاره، وقد يخطئ.
      </p>

      <div
        role="tablist"
        aria-label="أقسام المختبر"
        className="grid grid-cols-3 gap-1 rounded-2xl bg-paper-deep p-1"
        onKeyDown={onTabListKeyDown}
      >
        {tabs.map((item, index) => {
          const Icon = item.icon;
          const selected = tab === item.id;
          return (
            <button
              key={item.id}
              ref={(element) => {
                tabRefs.current[index] = element;
              }}
              type="button"
              role="tab"
              id={`tab-${item.id}`}
              aria-selected={selected}
              aria-controls={`panel-${item.id}`}
              tabIndex={selected ? 0 : -1}
              className={`inline-flex min-h-11 items-center justify-center gap-1 rounded-xl px-2 text-sm font-medium ${selected ? "bg-card text-ink" : "text-muted"}`}
              onClick={() => setTab(item.id)}
            >
              <Icon className="size-4 shrink-0" aria-hidden />
              {item.label}
              {item.id === "history" && historyCount > 0 ? (
                <span className="tabular-nums text-herb">{historyCount}</span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div role="tabpanel" id="panel-lab" aria-labelledby="tab-lab" className={tab === "lab" ? "" : "hidden"}>
        <LabPanel
          seed={seed}
          onNeedSettings={() => {
            setSettingsOpen(true);
          }}
        />
      </div>
      <div role="tabpanel" id="panel-card" aria-labelledby="tab-card" className={tab === "card" ? "" : "hidden"}>
        <CardPanel
          seed={seed}
          onNeedSettings={() => {
            setSettingsOpen(true);
          }}
        />
      </div>
      <div role="tabpanel" id="panel-history" aria-labelledby="tab-history" className={tab === "history" ? "" : "hidden"}>
        <HistoryPanel
          onOpen={(item) => {
            setSeed(item);
            setTab(item.kind === "lab" ? "lab" : "card");
          }}
        />
      </div>

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </main>
  );
}
