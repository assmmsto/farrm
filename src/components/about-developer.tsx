import { useState } from "react";
import { Mail, MessageCircle, X } from "lucide-react";

const DEVELOPER = {
  name: "Assm Mssto",
  phone: "0930322406",
  email: "assmm944@gmail.com",
};

const waHref = `https://wa.me/963${DEVELOPER.phone.replace(/^0/, "")}`;

/**
 * Developer identity, shown as ICONS only (no visible text): WhatsApp, e-mail,
 * and a monogram `AM` in place of the name. Each element is an accessible
 * button labelled for screen readers; pressing the monogram reveals the
 * details in a small popover for anyone who wants them in text.
 */
export function AboutDeveloper({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative flex flex-col items-end gap-2">
      <div className="flex items-center gap-2">
        <a
          href={waHref}
          target="_blank"
          rel="noreferrer noopener"
          aria-label={`واتساب المطوّر ${DEVELOPER.name}: ${DEVELOPER.phone}`}
          title={`واتساب: ${DEVELOPER.phone}`}
          className="grid size-10 place-items-center rounded-xl border border-line bg-card text-herb transition-colors hover:bg-herb-soft"
        >
          <MessageCircle className="size-5" aria-hidden />
          <span className="sr-only">{DEVELOPER.phone}</span>
        </a>

        <a
          href={`mailto:${DEVELOPER.email}`}
          aria-label={`إيميل المطوّر ${DEVELOPER.name}: ${DEVELOPER.email}`}
          title={`إيميل: ${DEVELOPER.email}`}
          className="grid size-10 place-items-center rounded-xl border border-line bg-card text-herb transition-colors hover:bg-herb-soft"
        >
          <Mail className="size-5" aria-hidden />
          <span className="sr-only">{DEVELOPER.email}</span>
        </a>

        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-label={`المطوّر ${DEVELOPER.name}`}
          title={DEVELOPER.name}
          className={`grid size-10 place-items-center rounded-xl border border-line text-sm font-bold tracking-tight ${
            open ? "bg-herb text-card" : "bg-card text-herb"
          }`}
        >
          {compact ? "A" : "AM"}
        </button>
      </div>

      {open ? (
        <div className="absolute top-full end-0 z-20 mt-2 w-64 rounded-2xl border border-line bg-card p-3 shadow-lg">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink" dir="ltr">
                {DEVELOPER.name}
              </p>
              <a
                href={waHref}
                target="_blank"
                rel="noreferrer noopener"
                className="mt-1 block text-sm text-herb"
                dir="ltr"
              >
                {DEVELOPER.phone}
              </a>
              <a href={`mailto:${DEVELOPER.email}`} className="block text-sm text-herb break-all" dir="ltr">
                {DEVELOPER.email}
              </a>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="إغلاق بيانات المطوّر"
              className="grid size-7 shrink-0 place-items-center rounded-lg border border-line text-muted"
            >
              <X className="size-3.5" aria-hidden />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
