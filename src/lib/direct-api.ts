/**
 * Direct browser → provider path.
 *
 * This module intentionally MIRRORS the public surface of `@/lib/client-api`
 * (`loadModels`, `runLab`, `runCard` with identical return shapes). The
 * standalone build (single HTML file + Capacitor APK) swaps it in through a
 * Vite alias on "@/lib/client-api", so no component code changes between the
 * hosted preview (server proxied) and the offline mobile builds (direct).
 *
 * Why direct works here: the user runs their own OpenAI-compatible proxy that
 * answers CORS, so the browser/WebView can talk to it without our server.
 *
 * Browser-specific notes vs. provider.server.ts:
 * - No DNS/SSRF guard possible (browsers can't resolve DNS); not needed for a
 *   personal build where the user types their own endpoint.
 * - http:// IS allowed (local proxies on LAN). Inside the Capacitor WebView
 *   mixed content is enabled in capacitor.config.ts; in a desktop browser an
 *   https page calling http would be blocked, so prefer https endpoints there.
 * - Redirects are followed by the browser, which already strips the
 *   Authorization header on cross-origin redirects.
 */
import { arabicError } from "@/lib/messages";
import { CARD_SYSTEM, LAB_SYSTEM } from "@/lib/prompts";
import type { CardInput, LabInput, ProviderConfig } from "@/lib/types";

type RunOk = { ok: true; content: string };
type RunErr = { ok: false; error: string };
type ModelsOk = { ok: true; models: string[] };

const MAX_BODY = 1_000_000;

/* ---------------------------------- URL ---------------------------------- */

function normalizeBrowserBase(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error("invalid_url");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("invalid_url");
  if (url.username || url.password) throw new Error("invalid_url");
  url.hash = "";
  url.search = "";
  let path = url.pathname.replace(/\/+$/, "");
  path = path.replace(/\/chat\/completions$/i, "");
  path = path.replace(/\/models$/i, "");
  path = path.replace(/\/+$/, "");
  url.pathname = path || "/";
  return url.toString().replace(/\/$/, "");
}

/* --------------------------------- fetch --------------------------------- */

async function readLimited(response: Response, max: number): Promise<string> {
  const declared = Number(response.headers.get("content-length") || 0);
  if (declared > max) throw new Error("response_too_large");
  if (!response.body) {
    const text = await response.text();
    if (text.length > max) throw new Error("response_too_large");
    return text;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      void reader.cancel().catch(() => undefined);
      throw new Error("response_too_large");
    }
    chunks.push(value);
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}

async function request(url: string, init: RequestInit): Promise<Response> {
  return fetch(url, {
    ...init,
    signal: AbortSignal.timeout(init.method === "GET" ? 20_000 : 70_000),
  });
}

function statusError(status: number): string {
  if (status === 401 || status === 403) return "unauthorized";
  if (status === 404) return "not_found";
  if (status === 429) return "rate_limit";
  if (status === 408) return "timeout";
  return "upstream";
}

function mapThrown(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === "TimeoutError" || error.name === "AbortError") return "timeout";
    if (error.message === "invalid_url" || error.message === "response_too_large") return error.message;
  }
  return "network";
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

/* --------------------------------- parsing -------------------------------- */

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

/* --------------------------------- upstream ------------------------------- */

async function listModelsDirect(
  baseUrl: string,
  apiKey: string,
): Promise<{ ok: true; models: string[] } | { ok: false; error: string; detail: string | null }> {
  try {
    const base = normalizeBrowserBase(baseUrl);
    const response = await request(`${base}/models`, {
      method: "GET",
      headers: { Accept: "application/json", Authorization: `Bearer ${apiKey}` },
    });
    const text = await readLimited(response, MAX_BODY);
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

async function postChatDirect(
  base: string,
  apiKey: string,
  model: string,
  system: string,
  user: string,
): Promise<{ ok: true; content: string } | { ok: false; error: string; detail: string | null }> {
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
    const response = await request(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(attempts[index]),
    });
    const text = await readLimited(response, MAX_BODY);
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

/* ---------------------------- public (client-api surface) ----------------- */

function fromThrow(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("invalid_input")) return arabicError("invalid_input");
  if (message.includes("invalid_url")) return arabicError("invalid_url");
  return arabicError("network");
}

export async function loadModels(baseUrl: string, apiKey: string): Promise<ModelsOk | RunErr> {
  try {
    const result = await listModelsDirect(baseUrl.trim(), apiKey.trim());
    if (!result.ok) return { ok: false, error: arabicError(result.error, result.detail) };
    return { ok: true, models: result.models };
  } catch (error) {
    return { ok: false, error: fromThrow(error) };
  }
}

export async function runLab(provider: ProviderConfig, input: LabInput): Promise<RunOk | RunErr> {
  try {
    const base = normalizeBrowserBase(provider.baseUrl);
    const user = [
      "جرّب دمج هذه المركبات:",
      ...input.compounds.map((compound, index) => `${index + 1}. ${oneLine(compound)}`),
      input.note.trim() ? `ملاحظة الصيدلي: ${oneLine(input.note)}` : "ملاحظة الصيدلي: لا يوجد",
      "غطِّ الإعطاء المشترك والمزج في المحلول أو المحقنة.",
    ].join("\n");
    const result = await postChatDirect(base, provider.apiKey.trim(), provider.model, LAB_SYSTEM, user);
    if (!result.ok) return { ok: false, error: arabicError(result.error, result.detail) };
    return { ok: true, content: result.content };
  } catch (error) {
    return { ok: false, error: fromThrow(error) };
  }
}

export async function runCard(provider: ProviderConfig, input: CardInput): Promise<RunOk | RunErr> {
  try {
    const base = normalizeBrowserBase(provider.baseUrl);
    const user = `استخرج بطاقة مرجعية لهذا الدواء أو المركب:\n${oneLine(input.name)}`;
    const result = await postChatDirect(base, provider.apiKey.trim(), provider.model, CARD_SYSTEM, user);
    if (!result.ok) return { ok: false, error: arabicError(result.error, result.detail) };
    return { ok: true, content: result.content };
  } catch (error) {
    return { ok: false, error: fromThrow(error) };
  }
}
