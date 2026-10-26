import type { ReactNode } from "react";

export const fieldClass =
  "min-h-11 w-full rounded-xl border border-line bg-card px-3 text-base text-ink outline-none transition-colors placeholder:text-muted focus-visible:border-herb focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-herb disabled:opacity-60";

export const primaryBtn =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-herb px-4 text-sm font-semibold text-card transition-colors hover:bg-herb-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-herb disabled:cursor-not-allowed disabled:opacity-50";

export const quietBtn =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-line bg-card px-4 text-sm font-medium text-ink transition-colors hover:bg-paper-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-herb disabled:cursor-not-allowed disabled:opacity-50";

export function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={htmlFor} className="text-sm font-medium text-ink">
        {label}
      </label>
      {children}
      {hint ? <p className="text-sm text-muted">{hint}</p> : null}
    </div>
  );
}
