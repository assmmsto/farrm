import { arabicError } from "@/lib/messages";
import { askPharmacy, listProviderModels } from "@/lib/provider.functions";
import type { CardInput, LabInput, ProviderConfig } from "@/lib/types";

type RunOk = { ok: true; content: string };
type RunErr = { ok: false; error: string };
type ModelsOk = { ok: true; models: string[] };

function fromThrow(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("invalid_input")) return arabicError("invalid_input");
  return arabicError("network");
}

export async function loadModels(baseUrl: string, apiKey: string): Promise<ModelsOk | RunErr> {
  try {
    const result = await listProviderModels({ data: { baseUrl: baseUrl.trim(), apiKey: apiKey.trim() } });
    if (!result.ok) return { ok: false, error: arabicError(result.error, result.detail) };
    return { ok: true, models: result.models };
  } catch (error) {
    return { ok: false, error: fromThrow(error) };
  }
}

export async function runLab(provider: ProviderConfig, input: LabInput): Promise<RunOk | RunErr> {
  try {
    const result = await askPharmacy({
      data: {
        baseUrl: provider.baseUrl.trim(),
        apiKey: provider.apiKey.trim(),
        model: provider.model,
        task: {
          kind: "lab",
          ingredients: input.ingredients,
          route: input.route,
          standard: input.standard,
          patient: input.patient,
          note: input.note,
        },
      },
    });
    if (!result.ok) return { ok: false, error: arabicError(result.error, result.detail) };
    return { ok: true, content: result.content };
  } catch (error) {
    return { ok: false, error: fromThrow(error) };
  }
}

export async function runCard(provider: ProviderConfig, input: CardInput): Promise<RunOk | RunErr> {
  try {
    const result = await askPharmacy({
      data: {
        baseUrl: provider.baseUrl.trim(),
        apiKey: provider.apiKey.trim(),
        model: provider.model,
        task: { kind: "card", name: input.name },
      },
    });
    if (!result.ok) return { ok: false, error: arabicError(result.error, result.detail) };
    return { ok: true, content: result.content };
  } catch (error) {
    return { ok: false, error: fromThrow(error) };
  }
}
