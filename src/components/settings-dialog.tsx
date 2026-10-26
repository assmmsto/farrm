import { useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Eye, EyeOff, Loader2, X } from "lucide-react";
import { loadModels } from "@/lib/client-api";
import { modelCountLabel } from "@/lib/messages";
import { usePharmacy } from "@/lib/pharmacy-store";
import { Field, fieldClass, primaryBtn, quietBtn } from "@/components/ui";

export function SettingsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const provider = usePharmacy((state) => state.provider);
  const patchProvider = usePharmacy((state) => state.patchProvider);
  const resetProvider = usePharmacy((state) => state.resetProvider);
  const [showKey, setShowKey] = useState(false);
  const [filter, setFilter] = useState("");
  const [manualModel, setManualModel] = useState("");
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [statusBad, setStatusBad] = useState(false);

  const models = useMemo(() => {
    const query = filter.trim().toLowerCase();
    const list = query ? provider.models.filter((model) => model.toLowerCase().includes(query)) : provider.models;
    if (provider.model && !list.includes(provider.model)) return [provider.model, ...list];
    return list;
  }, [filter, provider.model, provider.models]);

  async function testConnection() {
    setPending(true);
    setStatus(null);
    const result = await loadModels(provider.baseUrl, provider.apiKey);
    setPending(false);
    if (!result.ok) {
      setStatusBad(true);
      setStatus(result.error);
      return;
    }
    const model = result.models.includes(provider.model) ? provider.model : (result.models[0] ?? "");
    patchProvider({
      baseUrl: provider.baseUrl.trim(),
      apiKey: provider.apiKey.trim(),
      models: result.models,
      model,
      verified: true,
    });
    setStatusBad(false);
    setStatus(`تم الاتصال. ${modelCountLabel(result.models.length)} متاح.`);
  }

  async function approveManually() {
    const model = manualModel.trim();
    if (!model) return;
    patchProvider({
      baseUrl: provider.baseUrl.trim(),
      apiKey: provider.apiKey.trim(),
      model,
      models: provider.models.includes(model) ? provider.models : [model, ...provider.models],
      verified: true,
    });
    setStatusBad(false);
    setStatus("اعتُمد المزوّد يدوياً بلا فحص. إن رفض الرد لاحقاً راجع اسم النموذج عند مزوّدك.");
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/50" />
        <Dialog.Content className="dialog-rise fixed top-4 right-4 bottom-4 left-4 z-50 mx-auto flex max-w-lg flex-col gap-4 overflow-y-auto rounded-2xl border border-line bg-paper p-4 sm:right-auto sm:bottom-8 sm:left-1/2 sm:w-full sm:-translate-x-1/2 sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <Dialog.Title className="text-xl font-semibold">المزوّد</Dialog.Title>
                <Dialog.Description className="mt-1 text-sm text-muted">
                  الرابط والمفتاح فقط. الفحص يجلب النماذج، والاختيار يُحفظ على هذا الجهاز.
                </Dialog.Description>
              </div>
              <Dialog.Close className="grid size-11 shrink-0 place-items-center rounded-xl border border-line bg-card" aria-label="إغلاق">
                <X className="size-4" />
              </Dialog.Close>
            </div>

            <Field label="رابط الواجهة" htmlFor="provider-url" hint="واجهة متوافقة مع OpenAI، وتنتهي عادة بـ /v1">
              <input
                id="provider-url"
                className={`${fieldClass} text-left`}
                dir="ltr"
                inputMode="url"
                autoComplete="off"
                spellCheck={false}
                placeholder="https://api.river.ai/v1"
                value={provider.baseUrl}
                onChange={(event) => patchProvider({ baseUrl: event.target.value })}
              />
            </Field>

            <div className="flex flex-col gap-2">
              <label htmlFor="provider-key" className="text-sm font-medium">
                مفتاح API
              </label>
              <div className="relative">
                <input
                  id="provider-key"
                  className={`${fieldClass} pe-12 text-left`}
                  dir="ltr"
                  type={showKey ? "text" : "password"}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="الصق المفتاح"
                  value={provider.apiKey}
                  onChange={(event) => patchProvider({ apiKey: event.target.value })}
                />
                <button
                  type="button"
                  className="absolute end-1 top-1 grid size-9 place-items-center rounded-lg text-muted"
                  aria-label={showKey ? "إخفاء المفتاح" : "إظهار المفتاح"}
                  onClick={() => setShowKey((value) => !value)}
                >
                  {showKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              <p className="text-sm text-muted">المفتاح يبقى في متصفح هذا الجهاز ولا يُحفظ في قاعدة مشتركة.</p>
            </div>

            <button type="button" className={primaryBtn} disabled={pending || !provider.baseUrl.trim() || !provider.apiKey.trim()} onClick={() => void testConnection()}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
              {pending ? "يفحص الاتصال…" : "فحص الاتصال وجلب النماذج"}
            </button>

            {status ? <p className={`text-sm ${statusBad ? "text-danger" : "text-herb"}`}>{status}</p> : null}

            {provider.models.length > 0 ? (
              <div className="flex flex-col gap-3">
                {provider.models.length > 8 ? (
                  <Field label="تصفية النماذج" htmlFor="model-filter">
                    <input
                      id="model-filter"
                      className={`${fieldClass} text-left`}
                      dir="ltr"
                      value={filter}
                      placeholder="ابحث في اسم النموذج"
                      onChange={(event) => setFilter(event.target.value)}
                    />
                  </Field>
                ) : null}
                <Field label="النموذج" htmlFor="provider-model">
                  <select
                    id="provider-model"
                    className={`${fieldClass} text-left`}
                    dir="ltr"
                    value={provider.model}
                    onChange={(event) => patchProvider({ model: event.target.value })}
                  >
                    {models.map((model) => (
                      <option key={model} value={model}>
                        {model}
                      </option>
                    ))}
                  </select>
                </Field>
                <p className="text-sm text-muted">
                  {provider.verified ? "محفوظ ومتصل." : "غيّر الرابط أو المفتاح يتطلب فحصاً جديداً."}{" "}
                  {modelCountLabel(provider.models.length)} في آخر جلب.
                </p>
              </div>
            ) : null}

            <button
              type="button"
              className={quietBtn}
              onClick={() => {
                resetProvider();
                setStatus(null);
                setFilter("");
                setManualModel("");
              }}
            >
              مسح المزوّد من هذا الجهاز
            </button>

            <div className="flex flex-col gap-3 rounded-xl border border-dashed border-line p-3">
              <Field label="مزوّدك لا يملك قائمة نماذج أو يفشل الفحص؟" htmlFor="manual-model" hint="بعض البروكسيات تدعم المحادثة فقط. اكتب اسم النموذج كما يعرّفه مزوّدك واعتمد الاتصال مباشرة.">
                <input
                  id="manual-model"
                  className={`${fieldClass} text-left`}
                  dir="ltr"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="اسم النموذج عند مزوّدك"
                  value={manualModel}
                  onChange={(event) => setManualModel(event.target.value)}
                />
              </Field>
              <button
                type="button"
                className={quietBtn}
                disabled={!manualModel.trim() || !provider.baseUrl.trim() || !provider.apiKey.trim()}
                onClick={() => void approveManually()}
              >
                اعتماد المزوّد بدون فحص النماذج
              </button>
            </div>
          </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
