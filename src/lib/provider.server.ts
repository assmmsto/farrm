import { lookup } from "node:dns/promises";
import { CARD_SYSTEM, LAB_SYSTEM } from "@/lib/prompts";
import { isBlockedHostname, isIpLiteral, isPrivateIp, normalizeBase } from "@/lib/provider-guard";

export type ModelsResult =
  | { ok: true; models: string[] }
  | { ok: false; error: string; detail: string | null };

export type AskResult =
  | { ok: true; content: string }
  | { ok: false; error: string; detail: string | null };

export function mapThrown(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === "TimeoutError" || error.name === "AbortError") return "timeout";
    if (
      error.message === "invalid_url" ||
      error.message === "https_only" ||
      error.message === "blocked_host" ||
      error.message === "redirect_blocked" ||
      error.message === "network" ||
      error.message === "response_too_large"
    ) {
      return error.message;
    }
  }
  return "network";
}

async function assertPublicDns(base: string): Promise<void> {
  const host = new URL(base).hostname.replace(/^\[|\]$/g, "");
  if (isBlockedHostname(host)) throw new Error("blocked_host");
  if (isIpLiteral(host)) return;
  let records: { address: string }[];
  try {
    records = await lookup(host, { all: true, verbatim: true });
  } catch {
    throw new Error("network");
  }
  if (records.length === 0 || records.some((record) => isPrivateIp(record.address))) {
    throw new Error("blocked_host");
  }
}

async function readLimited(response: Response, max: number): Promise<string> {
  const declared = Number(response.headers.get("content-length") || 0);
  if (declared > max) throw new Error("response_too_large");
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > max) throw new Error("response_too_large");
  return new TextDecoder().decode(buffer);
}

async function safeFetch(url: string, init: RequestInit, hops = 0): Promise<Response> {
  const base = normalizeBase(new URL(url).origin + new URL(url).pathname.replace(/\/(models|chat\/completions)$/i, ""));
  await assertPublicDns(base);
  const response = await fetch(url, {
    ...init,
    redirect: "manual",
    signal: AbortSignal.timeout(init.method === "GET" ? 20_000 : 70_000),
  });
  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get("location");
    if (!location || hops >= 2) throw new Error("redirect_blocked");
    const nextUrl = new URL(location, url);
    let nextInit = init;
    if (nextUrl.origin !== new URL(url).origin) {
      // Never forward the API key to a different origin over a redirect.
      const headers = new Headers(init.headers);
      headers.delete("authorization");
      nextInit = { ...init, headers };
    }
    return safeFetch(nextUrl.toString(), nextInit, hops + 1);
  }
  return response;
}

function statusError(status: number): string {
  if (status === 401 || status === 403) return "unauthorized";
  if (status === 404) return "not_found";
  if (status === 429) return "rate_limit";
  if (status === 408) return "timeout";
  return "upstream";
}

function safeDetail(text: string, apiKey: string): string | null {
  const redact = (value: string) => (apiKey ? value.split(apiKey).join("***") : value);
  try {
    const parsed = JSON.parse(text) as { error?: { message?: unknown } | string; message?: unknown };
    const message =
      typeof parsed.error === "string"
        ? parsed.error
        : typeof parsed.error === "object" && parsed.error && typeof parsed.error.message === "string"
          ? parsed.error.message
          : typeof parsed.message === "string"
            ? parsed.message
            : "";
    const clean = redact(message).replace(/\s+/g, " ").trim().slice(0, 180);
    return clean || null;
  } catch {
    const clean = redact(text).replace(/\s+/g, " ").trim().slice(0, 180);
    if (!clean || clean.startsWith("<")) return null;
    return clean;
  }
}

function extractIds(value: unknown, into: Set<string>) {
  if (typeof value === "string" && value.trim() && value.length <= 200) {
    into.add(value.trim());
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) extractIds(item, into);
    return;
  }
  if (!value || typeof value !== "object") return;
  const record = value as Record<string, unknown>;
  if (typeof record.id === "string") extractIds(record.id, into);
  else if (typeof record.name === "string" && !("data" in record)) extractIds(record.name, into);
  if (Array.isArray(record.data)) extractIds(record.data, into);
  if (Array.isArray(record.models)) extractIds(record.models, into);
}

export async function listModelsUpstream(baseUrl: string, apiKey: string): Promise<ModelsResult> {
  try {
    const base = normalizeBase(baseUrl);
    const response = await safeFetch(`${base}/models`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
    });
    const text = await readLimited(response, 1_000_000);
    if (!response.ok) {
      return { ok: false, error: statusError(response.status), detail: safeDetail(text, apiKey) };
    }
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      return { ok: false, error: "upstream", detail: "الرد ليس JSON" };
    }
    const ids = new Set<string>();
    extractIds(parsed, ids);
    const models = [...ids].sort((a, b) => a.localeCompare(b)).slice(0, 400);
    if (models.length === 0) return { ok: false, error: "no_models", detail: null };
    return { ok: true, models };
  } catch (error) {
    return { ok: false, error: mapThrown(error), detail: null };
  }
}

function extractContent(raw: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return "";
  }
  if (!parsed || typeof parsed !== "object") return "";
  const choices = (parsed as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || !choices[0] || typeof choices[0] !== "object") return "";
  const choice = choices[0] as { message?: unknown; text?: unknown };
  if (typeof choice.text === "string" && choice.text.trim()) return choice.text;
  const message = choice.message;
  if (!message || typeof message !== "object") return "";
  const content = (message as { content?: unknown }).content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object" && typeof (part as { text?: unknown }).text === "string") {
          return (part as { text: string }).text;
        }
        return "";
      })
      .join("");
  }
  return "";
}

async function postChat(base: string, apiKey: string, model: string, system: string, user: string): Promise<AskResult> {
  const messages = [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
  const attempts: Record<string, unknown>[] = [
    { model, temperature: 0.2, max_tokens: 3500, messages },
    { model, messages },
  ];
  let lastDetail: string | null = null;
  for (let index = 0; index < attempts.length; index += 1) {
    const response = await safeFetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(attempts[index]),
    });
    const text = await readLimited(response, 1_000_000);
    if (response.ok) {
      const content = extractContent(text).slice(0, 100_000);
      if (!content.trim()) return { ok: false, error: "empty", detail: null };
      return { ok: true, content };
    }
    lastDetail = safeDetail(text, apiKey);
    const retry = response.status === 400 && index === 0;
    if (!retry) return { ok: false, error: statusError(response.status), detail: lastDetail };
  }
  return { ok: false, error: "upstream", detail: lastDetail };
}

function oneLine(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

export async function askUpstream(input: {
  baseUrl: string;
  apiKey: string;
  model: string;
  task:
    | { kind: "lab"; compounds: string[]; note?: string }
    | { kind: "card"; name: string };
}): Promise<AskResult> {
  try {
    const base = normalizeBase(input.baseUrl);
    const user =
      input.task.kind === "lab"
        ? [
            "جرّب دمج هذه المركبات:",
            ...input.task.compounds.map((compound, index) => `${index + 1}. ${oneLine(compound)}`),
            input.task.note?.trim() ? `ملاحظة الصيدلي: ${oneLine(input.task.note)}` : "ملاحظة الصيدلي: لا يوجد",
            "غطِّ الإعطاء المشترك والمزج في المحلول أو المحقنة.",
          ].join("\n")
        : `استخرج بطاقة مرجعية لهذا الدواء أو المركب:\n${oneLine(input.task.name)}`;
    const system = input.task.kind === "lab" ? LAB_SYSTEM : CARD_SYSTEM;
    return await postChat(base, input.apiKey, input.model, system, user);
  } catch (error) {
    return { ok: false, error: mapThrown(error), detail: null };
  }
}
