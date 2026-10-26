import { useState } from "react";
import { Trash2 } from "lucide-react";
import { formatWhen } from "@/lib/messages";
import { usePharmacy } from "@/lib/pharmacy-store";
import type { HistoryItem } from "@/lib/types";
import { quietBtn } from "@/components/ui";

export function HistoryPanel({ onOpen }: { onOpen: (item: HistoryItem) => void }) {
  const history = usePharmacy((state) => state.history);
  const removeHistory = usePharmacy((state) => state.removeHistory);
  const clearHistory = usePharmacy((state) => state.clearHistory);
  const [confirmClear, setConfirmClear] = useState(false);

  if (history.length === 0) {
    return (
      <section className="rounded-2xl border border-line bg-card p-4">
        <h2 className="text-lg font-semibold">السجل</h2>
        <p className="mt-2 text-sm text-muted">لا توجد بحوث محفوظة بعد. كل تجربة وبطاقة تُحفظ هنا على هذا الجهاز.</p>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">بحوث محفوظة</h2>
        {confirmClear ? (
          <div className="flex gap-2">
            <button
              type="button"
              className={quietBtn}
              onClick={() => {
                clearHistory();
                setConfirmClear(false);
              }}
            >
              تأكيد المسح
            </button>
            <button type="button" className={quietBtn} onClick={() => setConfirmClear(false)}>
              إلغاء
            </button>
          </div>
        ) : (
          <button type="button" className={quietBtn} onClick={() => setConfirmClear(true)}>
            مسح السجل
          </button>
        )}
      </div>
      <ul className="flex flex-col gap-2">
        {history.map((item) => (
          <li key={item.id} className="flex items-stretch gap-2">
            <button
              type="button"
              className="flex min-w-0 flex-1 flex-col gap-1 rounded-2xl border border-line bg-card px-4 py-3 text-start"
              onClick={() => onOpen(item)}
            >
              <span className="text-sm font-semibold text-herb">{item.kind === "lab" ? "مختبر" : "بطاقة"}</span>
              <span className="font-medium text-pretty">{item.title}</span>
              <span className="text-sm text-muted">
                {formatWhen(item.createdAt)}
                {" · "}
                <bdi dir="ltr">{item.model}</bdi>
              </span>
            </button>
            <button
              type="button"
              className="grid w-11 shrink-0 place-items-center rounded-2xl border border-line bg-card text-danger"
              aria-label={`حذف ${item.title}`}
              onClick={() => removeHistory(item.id)}
            >
              <Trash2 className="size-4" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
