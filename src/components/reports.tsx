import { useState, type ReactNode } from "react";
import { SEVERITY_LABEL } from "@/lib/messages";
import {
  formatMg,
  formatNum,
  parseWeight,
  type CardReport,
  type Confidence,
  type Dosing,
  type LabReport,
  type Severity,
} from "@/lib/normalize";
import { Field, fieldClass } from "@/components/ui";

const tone: Record<Severity, string> = {
  major: "bg-danger-soft text-danger",
  moderate: "bg-brass-soft text-brass",
  minor: "bg-herb-soft text-herb",
  none: "bg-paper-deep text-muted",
  unknown: "bg-paper-deep text-ink",
};

const EMPTY = "لم تُذكر معلومة. الفراغ لا يعني الأمان.";

export function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <span className={`inline-flex min-h-8 items-center rounded-full px-3 text-sm font-semibold ${tone[severity]}`}>
      {SEVERITY_LABEL[severity]}
    </span>
  );
}

export function RawAnswer({ content }: { content: string }) {
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-line bg-card p-4">
      <h2 className="text-lg font-semibold">تعذر ترتيب التقرير</h2>
      <p className="text-sm text-muted">هذا نص النموذج كما وصل. لا تعتمد عليه كبطاقة منظمة.</p>
      <pre className="font-sans text-sm whitespace-pre-wrap break-words text-ink">{content}</pre>
    </section>
  );
}

function Assumption({ text }: { text: string }) {
  if (!text) return null;
  return (
    <p className="rounded-xl bg-paper-deep px-3 py-2 text-sm text-ink">
      <span className="font-semibold">افتراض القراءة: </span>
      {text}
    </p>
  );
}

export function LabReportView({
  report,
  compounds,
  model,
}: {
  report: LabReport;
  compounds: string[];
  model: string;
}) {
  return (
    <article className="overflow-hidden rounded-2xl border border-line bg-card">
      <header className="flex flex-col gap-3 bg-herb-soft px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-center gap-2">
          <SeverityBadge severity={report.severity} />
          {confidenceLabel(report.confidence) ? (
            <span className="rounded-full bg-card/70 px-3 py-1 text-xs font-medium text-ink">
              ثقة النموذج: {confidenceLabel(report.confidence)}
            </span>
          ) : null}
          {report.sources.length > 0 ? (
            <span className="rounded-full bg-card/70 px-3 py-1 text-xs font-medium text-ink">
              عن {report.sources.length} مرجع
            </span>
          ) : (
            <span className="rounded-full bg-card/70 px-3 py-1 text-xs font-medium text-danger">
              بلا مرجع معلن
            </span>
          )}
        </div>
        <h2 className="text-2xl font-semibold leading-snug text-ink">{report.headline}</h2>
        <p className="text-sm text-muted">{compounds.join(" + ")}</p>
      </header>
      {report.severity === "unknown" ? (
        <p className="border-y border-line bg-paper-deep px-4 py-3 text-sm text-pretty text-ink">
          <span className="font-semibold">هذا النموذج لم يحسم الشدة. </span>
          «غير محسوم» ليست درجة أمان — راجع المرجع المعتمد قبل أي قرار.
        </p>
      ) : null}
      <div className="flex flex-col gap-4 px-4 py-4 sm:px-5">
        <Assumption text={report.assumption} />
        <p className="text-base text-pretty text-ink">{report.result}</p>
      </div>
      <div className="flex flex-col gap-4 border-t border-line px-4 py-4 sm:px-5">
        <h3 className="text-lg font-semibold">التقرير الكامل</h3>
        {report.sections.length === 0 ? (
          <p className="text-sm text-muted">{EMPTY}</p>
        ) : (
          <ol className="flex flex-col gap-4">
            {report.sections.map((section, index) => (
              <li key={`${section.title}-${index}`} className="flex flex-col gap-1">
                <h4 className="font-semibold text-ink">
                  {index + 1}. {section.title}
                </h4>
                <p className="text-pretty whitespace-pre-wrap text-ink">{section.body || EMPTY}</p>
              </li>
            ))}
          </ol>
        )}
        {report.sources.length > 0 ? (
          <div className="rounded-xl bg-paper-deep px-3 py-3">
            <span className="text-sm font-semibold">المراجع المعلنة: </span>
            <span className="text-sm text-ink">{report.sources.join(" · ")}</span>
          </div>
        ) : null}
        {report.uncertainties ? (
          <p className="rounded-xl bg-brass-soft px-3 py-3 text-sm text-pretty text-ink">
            <span className="font-semibold">ما لم يُحسم: </span>
            {report.uncertainties}
          </p>
        ) : null}
        <ReportFoot model={model} />
      </div>
    </article>
  );
}

function confidenceLabel(confidence: Confidence): string {
  if (confidence === "high") return "عالية";
  if (confidence === "medium") return "متوسطة";
  if (confidence === "low") return "منخفضة";
  return "";
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2 border-t border-line pt-4">
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      {children}
    </section>
  );
}

function Lines({ items }: { items: string[] }) {
  if (items.length === 0) return <p className="text-sm text-muted">{EMPTY}</p>;
  return (
    <ul className="flex flex-col gap-2">
      {items.map((item, index) => (
        <li key={`${item}-${index}`} className="flex gap-2 text-pretty">
          <span className="mt-2 size-1.5 shrink-0 rounded-full bg-herb" aria-hidden />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <p className="text-sm text-pretty">
      <span className="font-semibold">{label}: </span>
      {value}
    </p>
  );
}

function DoseLine({ label, mgPerKg, weight }: { label: string; mgPerKg: number | null; weight: number }) {
  if (mgPerKg === null) return null;
  const dose = weight * mgPerKg;
  return (
    <div className="flex flex-col gap-1 border-t border-line pt-3 first:border-t-0 first:pt-0">
      <span className="text-sm text-muted">{label}</span>
      <p dir="ltr" className="text-end text-2xl font-semibold text-ink tabular-nums">
        {formatMg(dose)} mg
      </p>
      <p dir="ltr" className="text-end text-sm text-muted tabular-nums">
        {formatNum(weight)} kg × {formatNum(mgPerKg)} mg/kg
      </p>
    </div>
  );
}

function DoseCalculator({ dosing }: { dosing: Dosing }) {
  const [weight, setWeight] = useState("");
  const parsed = parseWeight(weight);
  const typed = weight.trim() !== "";
  const invalid = typed && parsed === null;
  const hasPerKg = dosing.perKgMin !== null || dosing.perKgUsual !== null || dosing.perKgMax !== null;

  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-herb-soft p-4">
      <h3 className="text-base font-semibold text-ink">الجرعة حسب الوزن</h3>
      <Meta label="الطريق" value={dosing.route} />
      <Meta label="التكرار" value={dosing.frequency} />
      <Meta label="الحد اليومي" value={dosing.maxDaily} />
      <Meta label="جرعة البالغ" value={dosing.adultUsual} />
      <Meta label="ملاحظة الأطفال" value={dosing.pediatricNote} />
      <Meta label="تعديلات" value={dosing.adjustments} />
      <Meta label="ملاحظات الرقم" value={dosing.notes} />
      {hasPerKg ? (
        <>
          <Field label="وزن المريض بالكيلوغرام" htmlFor="patient-weight" hint="الحساب للجرعة الواحدة: الوزن × ملغ/كغ">
            <input
              id="patient-weight"
              className={fieldClass}
              inputMode="decimal"
              dir="ltr"
              placeholder="70"
              value={weight}
              onChange={(event) => setWeight(event.target.value)}
            />
          </Field>
          {invalid ? <p className="text-sm text-danger">أدخل وزناً أكبر من صفر وحتى 400 كغ.</p> : null}
          {parsed !== null ? (
            <div className="flex flex-col gap-3 rounded-xl bg-card p-4">
              <DoseLine label="الحد الأدنى" mgPerKg={dosing.perKgMin} weight={parsed} />
              <DoseLine label="الجرعة المعتادة" mgPerKg={dosing.perKgUsual} weight={parsed} />
              <DoseLine label="الحد الأقصى للجرعة" mgPerKg={dosing.perKgMax} weight={parsed} />
            </div>
          ) : null}
        </>
      ) : (
        <p className="text-sm text-muted">لا يوجد رقم ملغ/كغ في الرد. لا تُحسب جرعة من فراغ.</p>
      )}
      <p className="text-sm text-muted">
        حاسبة مراجعة فقط. طابق الناتج مع النشرة، والعمر، ووظيفة الكلية والكبد، وحكمك المهني.
      </p>
    </div>
  );
}

export function CardReportView({
  report,
  query,
  model,
}: {
  report: CardReport;
  query: string;
  model: string;
}) {
  const title = report.nameAr || query;
  return (
    <article className="flex flex-col gap-4 rounded-2xl border border-line bg-card px-4 py-4 sm:px-5">
      <header className="flex flex-col gap-2">
        <p className="text-sm font-medium text-herb">بطاقة الدواء</p>
        <h2 className="text-2xl font-semibold text-ink">{title}</h2>
        {report.nameLat ? (
          <p dir="ltr" className="text-end text-sm text-muted">
            {report.nameLat}
          </p>
        ) : null}
        {report.drugClass ? <p className="text-sm font-medium text-herb">{report.drugClass}</p> : null}
        <Assumption text={report.assumption} />
      </header>
      <Block title="شو هو">
        <p className="whitespace-pre-wrap text-pretty">{report.whatItIs || EMPTY}</p>
      </Block>
      <Block title="لشو يُستخدم">
        <Lines items={report.usedFor} />
      </Block>
      <Block title="التركيب الكيميائي">
        <p className="whitespace-pre-wrap text-pretty">{report.chemicalComposition || EMPTY}</p>
      </Block>
      <Block title="كيف يُصرف ويُوصف">
        <p className="whitespace-pre-wrap text-pretty">{report.howPrescribed || EMPTY}</p>
      </Block>
      <Block title="الإطراح والحركية">
        <p className="whitespace-pre-wrap text-pretty">{report.kinetics || EMPTY}</p>
      </Block>
      <Block title="موانع الإعطاء">
        <Lines items={report.contraindications} />
      </Block>
      <Block title="التداخل مع الطعام">
        <Lines items={report.foodInteractions} />
      </Block>
      <Block title="المعادن والمعقدات">
        {report.mineralComplexes.length === 0 ? (
          <p className="text-sm text-muted">{EMPTY}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {report.mineralComplexes.map((item, index) => (
              <li key={`${item.partner}-${index}`} className="rounded-xl bg-paper px-3 py-3">
                <p className="font-semibold">{item.partner}</p>
                {item.whatHappens ? <p className="text-pretty">{item.whatHappens}</p> : null}
                {item.advice ? <p className="text-sm text-herb">{item.advice}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </Block>
      <Block title="تداخلات دوائية مهمة">
        {report.drugInteractions.length === 0 ? (
          <p className="text-sm text-muted">{EMPTY}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {report.drugInteractions.map((item, index) => (
              <li key={`${item.with}-${index}`} className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{item.with}</span>
                  <SeverityBadge severity={item.severity} />
                </div>
                {item.effect ? <p className="text-pretty">{item.effect}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </Block>
      <Block title="تحذيرات الإعطاء">
        <Lines items={report.administrationWarnings} />
      </Block>
      <Block title="الجرعة">
        <DoseCalculator dosing={report.dosing} />
      </Block>
      <Block title="ما لم يُحسم">
        <p className="text-pretty">{report.uncertainties || "لم يذكر النموذج نقطة غير محسومة إضافية."}</p>
      </Block>
      <ReportFoot model={model} />
    </article>
  );
}

function ReportFoot({ model }: { model: string }) {
  return (
    <p className="text-sm text-muted">
      المصدر: النموذج{" "}
      <bdi dir="ltr" className="font-medium">
        {model}
      </bdi>
      . راجع النشرة والمرجع المعتمد قبل أي قرار.
    </p>
  );
}
