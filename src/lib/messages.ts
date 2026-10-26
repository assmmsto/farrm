import type { Severity } from "@/lib/normalize";

export const SEVERITY_LABEL: Record<Severity, string> = {
  major: "خطر عالٍ",
  moderate: "متوسط",
  minor: "بسيط",
  none: "لا تداخل مهم",
  unknown: "غير محسوم",
};

const ERRORS: Record<string, string> = {
  invalid_url: "الرابط غير صالح. مثال: https://api.river.ai/v1",
  https_only: "الرابط لازم يبدأ بـ https",
  blocked_host: "هذا العنوان مرفوض. استخدم رابط المزوّد العام فقط",
  invalid_input: "تحقق من الحقول ثم أعد المحاولة",
  unauthorized: "رفض المزوّد المفتاح",
  not_found: "المسار غير موجود. غالباً الرابط ينتهي بـ /v1",
  rate_limit: "المزوّد طلب الانتظار قليلاً ثم إعادة المحاولة",
  upstream: "المزوّد رجّع خطأ",
  network: "تعذر الاتصال بالمزوّد. تحقق من الرابط والشبكة؛ وعند الاتصال المباشر تأكد أن البروكسي يسمح باتصالات المتصفح (CORS)",
  no_models: "تم الاتصال لكن قائمة النماذج فارغة",
  empty: "النموذج رجّع رداً فارغاً",
  timeout: "انتهت مهلة الاتصال. أعد المحاولة",
  not_configured: "اضبط الرابط والمفتاح والنموذج من الإعدادات",
  response_too_large: "رد المزوّد أكبر من المتوقع",
  redirect_blocked: "المزوّد حاول التحويل لعنوان غير مسموح",
};

export function arabicError(code: string, detail?: string | null): string {
  const base = ERRORS[code] ?? "حدث خطأ غير متوقع";
  const extra = detail?.trim();
  if (!extra) return base;
  if (code === "upstream" || code === "unauthorized" || code === "not_found" || code === "rate_limit") {
    return `${base}: ${extra}`;
  }
  return base;
}

export function modelCountLabel(count: number): string {
  if (count === 1) return "نموذج واحد";
  if (count === 2) return "نموذجان";
  if (count >= 3 && count <= 10) return `${count} نماذج`;
  return `${count} نموذجاً`;
}

const dateFmt = new Intl.DateTimeFormat("ar-u-nu-latn", {
  dateStyle: "medium",
  timeStyle: "short",
});

export function formatWhen(timestamp: number): string {
  return dateFmt.format(timestamp);
}
