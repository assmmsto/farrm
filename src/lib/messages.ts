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
  unreachable:
    "العنوان لا يُعرَّف من هذا الجهاز. تحقق من كتابة النطاق حرفاً حرفاً، وافتح الرابط نفسه في متصفح الهاتف: إن ظهر ERR_NAME_NOT_RESOLVED فالمشكلة في النطاق لا في التطبيق (رابط منتهٍ/مخطوء/محجوب DNS)",
  browser_blocked:
    "المزوّد يستجيب فعلاً، لكن المتصفح منع قراءة الرد لأنه لا يرسل ترويسة Access-Control-Allow-Origin (قانون المتصفحات). الحل: استخدم تطبيق الأندرويد (يتصل أصلياً بلا قيود)، أو شغّل الوسيط المحلي وأدخل http://127.0.0.1:8787/v1 كرابط",
  browser_blocked_file:
    "المزوّد يستجيب، لكن المتصفح منع الرد لأن الصفحة مفتوحة من ملف محلي (أصلها null) والمزوّد لا يرسل ترويسة CORS. الحلول: (1) تطبيق الأندرويد — الأفضل، (2) شغّل الوسيط المحلي ثم ضع http://127.0.0.1:8787/v1 كرابط، (3) اطلب من المزوّد تفعيل ترويسة Access-Control-Allow-Origin",
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
