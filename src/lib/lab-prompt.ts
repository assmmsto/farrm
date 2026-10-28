import { ROUTE_LABEL, ingredientsLabel, type LabInput } from "@/lib/types";

function oneLine(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

/**
 * The user turn for a lab evaluation. Shared by the server path and the direct
 * browser/APK path so both ask the model exactly the same thing.
 *
 * Doses, route and patient are stated as hard facts (not hints): the model has
 * to judge the risk of THIS administration to THIS patient.
 */
export function buildLabPrompt(input: LabInput): string {
  const lines: string[] = [
    "المهمة: تقييم إعطاء هذه المواد لمريض واحد في وقت واحد (أو متقارب).",
    "الجرعات وطريق الإعطاء:",
    ...input.ingredients.map(
      (item, index) => `${index + 1}. ${oneLine(item.name)} — ${item.amount} ${item.unit}`,
    ),
    `طريق الإعطاء: ${ROUTE_LABEL[input.route]}`,
    "بيانات المريض:",
    `  العمر: ${input.patient.age} سنة`,
    input.patient.weightKg ? `  الوزن: ${input.patient.weightKg} كغ` : "  الوزن: غير مذكور",
    input.patient.conditions ? `  حالات: ${oneLine(input.patient.conditions)}` : "  حالات: لا يوجد",
    input.note.trim() ? `ملاحظة الصيدلي: ${oneLine(input.note)}` : "ملاحظة الصيدلي: لا يوجد",
    "",
    "المطلوب:",
    "1. قيّم الجرعة المذكورة لكل مادة: ضمن المدى المعتاد؟ الحد الأقصى؟ مناسبة للعمر والوزن؟",
    "2. قيّم إعطاءها معاً لهذا المريض: تداخل، تضاعف سمّية، طريق الإعطاء نفسه.",
    "3. إن لم تجد مرجعاً يثبت السلامة، لا تطمئن: استخدم unknown أو caution واذكر المرجع المطلوب.",
  ];
  return lines.join("\n");
}

/** Short label used for history titles and the report header. */
export function labInputLabel(input: LabInput): string {
  return ingredientsLabel(input.ingredients);
}
