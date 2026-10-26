export type ProviderConfig = {
  baseUrl: string;
  apiKey: string;
  model: string;
  models: string[];
  verified: boolean;
};

export type LabInput = {
  compounds: string[];
  note: string;
};

export type CardInput = {
  name: string;
};

export type HistoryItem = {
  id: string;
  kind: "lab" | "card";
  title: string;
  createdAt: number;
  model: string;
  input: LabInput | CardInput;
  content: string;
};

export const emptyProvider: ProviderConfig = {
  baseUrl: "",
  apiKey: "",
  model: "",
  models: [],
  verified: false,
};

export function providerReady(provider: ProviderConfig): boolean {
  return Boolean(
    provider.verified && provider.baseUrl.trim() && provider.apiKey.trim() && provider.model.trim(),
  );
}

export function asLabInput(input: LabInput | CardInput): LabInput | null {
  if (!("compounds" in input) || !Array.isArray(input.compounds)) return null;
  const compounds = input.compounds.filter((item): item is string => typeof item === "string").slice(0, 6);
  const note = "note" in input && typeof input.note === "string" ? input.note : "";
  if (compounds.length < 2) return null;
  return { compounds, note };
}

export function asCardInput(input: LabInput | CardInput): CardInput | null {
  if (!("name" in input) || typeof input.name !== "string" || !input.name.trim()) return null;
  return { name: input.name };
}
