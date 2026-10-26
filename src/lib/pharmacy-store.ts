import { create } from "zustand";
import { emptyProvider, type HistoryItem, type ProviderConfig } from "@/lib/types";

const PROVIDER_KEY = "pharmacy.provider.v1";
const HISTORY_KEY = "pharmacy.history.v1";

type PharmacyState = {
  hydrated: boolean;
  provider: ProviderConfig;
  history: HistoryItem[];
  hydrate: () => void;
  patchProvider: (patch: Partial<ProviderConfig>) => void;
  resetProvider: () => void;
  addHistory: (item: HistoryItem) => void;
  removeHistory: (id: string) => void;
  clearHistory: () => void;
};

function readProvider(): ProviderConfig {
  try {
    const raw = localStorage.getItem(PROVIDER_KEY);
    if (!raw) return emptyProvider;
    const parsed = JSON.parse(raw) as Partial<ProviderConfig>;
    const models = Array.isArray(parsed.models)
      ? parsed.models.filter((item): item is string => typeof item === "string").slice(0, 400)
      : [];
    return {
      baseUrl: typeof parsed.baseUrl === "string" ? parsed.baseUrl : "",
      apiKey: typeof parsed.apiKey === "string" ? parsed.apiKey : "",
      model: typeof parsed.model === "string" ? parsed.model : "",
      models,
      verified: Boolean(parsed.verified && parsed.baseUrl && parsed.apiKey && parsed.model),
    };
  } catch {
    return emptyProvider;
  }
}

function readHistory(): HistoryItem[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const out: HistoryItem[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== "object") continue;
      const row = item as Partial<HistoryItem>;
      if (row.kind !== "lab" && row.kind !== "card") continue;
      if (typeof row.id !== "string" || typeof row.title !== "string" || typeof row.content !== "string") continue;
      if (typeof row.createdAt !== "number" || typeof row.model !== "string" || !row.input) continue;
      out.push({
        id: row.id,
        kind: row.kind,
        title: row.title.slice(0, 200),
        createdAt: row.createdAt,
        model: row.model.slice(0, 200),
        input: row.input,
        content: row.content.slice(0, 80_000),
      });
      if (out.length >= 30) break;
    }
    return out;
  } catch {
    return [];
  }
}

function writeProvider(provider: ProviderConfig) {
  localStorage.setItem(PROVIDER_KEY, JSON.stringify(provider));
}

function writeHistory(history: HistoryItem[]) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}

export const usePharmacy = create<PharmacyState>((set, get) => ({
  hydrated: false,
  provider: emptyProvider,
  history: [],
  hydrate: () => {
    if (get().hydrated) return;
    try {
      set({ hydrated: true, provider: readProvider(), history: readHistory() });
    } catch {
      set({ hydrated: true });
    }
  },
  patchProvider: (patch) => {
    const current = get().provider;
    const next: ProviderConfig = { ...current, ...patch };
    const urlChanged = patch.baseUrl !== undefined && patch.baseUrl.trim() !== current.baseUrl;
    const keyChanged = patch.apiKey !== undefined && patch.apiKey !== current.apiKey;
    if ((urlChanged || keyChanged) && patch.verified !== true) next.verified = false;
    set({ provider: next });
    if (get().hydrated) writeProvider(next);
  },
  resetProvider: () => {
    set({ provider: emptyProvider });
    if (get().hydrated) writeProvider(emptyProvider);
  },
  addHistory: (item) => {
    const history = [item, ...get().history].slice(0, 30);
    set({ history });
    if (get().hydrated) writeHistory(history);
  },
  removeHistory: (id) => {
    const history = get().history.filter((item) => item.id !== id);
    set({ history });
    if (get().hydrated) writeHistory(history);
  },
  clearHistory: () => {
    set({ history: [] });
    if (get().hydrated) writeHistory([]);
  },
}));
