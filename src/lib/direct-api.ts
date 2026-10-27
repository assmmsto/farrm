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
import { CARD_SYSTEM, LAB_SYSTEM, SAFETY_RULES } from "@/lib/prompts";
import { httpRequest, isNativeRuntime } from "@/lib/transport";
import type { CardInput, LabInput, ProviderConfig } from "@/lib/types";

type RunOk = { ok: true; content: string };
type RunErr = { ok: false; error: string };
type ModelsOk = { ok: true; models: string[] };

const MAX_BODY = 1_000_000;

/* ---------------------------------- URL ---------------------------------- */

function normalizeBrowserBase(raw: string): string {
  const trimmed = raw.trim();
  // Forgive a missing scheme: "api.example.com/v1" → "https://api.example.com/v1"
  const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(withScheme);
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

function limitBody(text: string, max: number): string {
  if (text.length > max) throw new Error("response_too_large");
  return text;
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

/** The page is being run straight off the disk (file://) → origin is "null". */
function isFilePage(): boolean {
  try {
    return typeof location !== "undefined" && location.protocol === "file:";
  } catch {
    return false;
  }
}

/**
 * Browsers hide WHY a fetch failed: CORS, DNS, TCP and TLS all surface as a bare
 * TypeError. A `no-cors` probe is the discriminator — it reaches the server for
 * ANY response status (opaque reply) and rejects only when the host itself is
 * unreachable. The probe targets the REAL endpoint on purpose: probing the bare
 * base URL is useless because OpenAI-style gateways answer it (river.ai returns
 * 200 grpc for `GET /v1`), which would fake "reachable" for every failure,
 * including a wrong API key.
 *   main call fails + probe succeeds → the host answered ⇒ the browser blocked
 *                                      the response (CORS) — a browser law
 *   main call fails + probe fails    → host unreachable (DNS/TCP/TLS)
 */
async function probeReachable(base: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      await fetch(`${base}/models`, {
        method: "GET",
        mode: "no-cors",
        cache: "no-store",
        signal: controller.signal,
      });
      return true;
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return false;
  }
}

async function refineNetworkError(baseUrl: string, error: string): Promise<string> {
  if (error !== "network") return error;
  // Inside the APK the transport is native and CORS does not exist; a failed
  // call there is a genuine reachability problem, so skip the browser probe.
  if (isNativeRuntime()) return "unreachable";
  let base: string;
  try {
    base = normalizeBrowserBase(baseUrl);
  } catch {
    return error;
  }
  const reachable = await probeReachable(base);
  if (!reachable) return "unreachable";
  return isFilePage() ? "browser_blocked_file" : "browser_blocked";
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
    const response = await httpRequest({
      url: `${base}/models`,
      method: "GET",
      headers: { Accept: "application/json", Authorization: `Bearer ${apiKey}` },
      timeoutMs: 25_000,
    });
    const text = limitBody(response.text, MAX_BODY);
    if (response.status < 200 || response.status >= 300) {
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
    // Most OpenAI-compatible providers honour response_format JSON mode; it
    // eliminates the prose wrapper that made the parser fall back to raw text.
    // The second attempt drops every optional field for providers that reject them.
    { model, temperature: 0.2, max_tokens: 3500, response_format: { type: "json_object" }, messages },
    { model, temperature: 0.2, max_tokens: 3500, messages },
    { model, messages },
  ];
  let lastDetail: string | null = null;
  for (let index = 0; index < attempts.length; index += 1) {
    const response = await httpRequest({
      url: `${base}/chat/completions`,
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(attempts[index]),
      timeoutMs: 70_000,
    });
    const text = limitBody(response.text, MAX_BODY);
    if (response.status >= 200 && response.status < 300) {
      const content = extractContent(text).slice(0, 100_000);
      if (!content.trim()) return { ok: false, error: "empty", detail: null };
      return { ok: true, content };
    }
    lastDetail = safeDetail(text, apiKey);
    // 400/422 = provider rejected an optional field (response_format, temperature…)
    // → retry with a simpler body. Anything else is a real failure.
    const canRetry = (response.status === 400 || response.status === 422) && index < attempts.length - 1;
    if (!canRetry) return { ok: false, error: statusError(response.status), detail: lastDetail };
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
    if (!result.ok) {
      const error = await refineNetworkError(baseUrl, result.error);
      return { ok: false, error: arabicError(error, result.detail) };
    }
    return { ok: true, models: result.models };
  } catch (error) {
    return { ok: false, error: fromThrow(error) };
  }
}

export async function runLab(provider: ProviderConfig, input: LabInput): Promise<RunOk | RunErr> {
  try {
    const base = normalizeBrowserBase(provider.baseUrl);
    const user = [
      "جرّب دمج هذه المواد/الأدوية:",
      ...input.compounds.map((compound, index) => `${index + 1}. ${oneLine(compound)}`),
      input.note.trim() ? `ملاحظة الصيدلي: ${oneLine(input.note)}` : "ملاحظة الصيدلي: لا يوجد",
      "غطِّ المحورين معاً وافصل بينهما صراحة:",
      "أ) المزج في وعاء/محلول/محقنة (توافق كيميائي-فيزيائي مرئي).",
      "ب) إعطاؤهما للمريض معاً أو بالتتابع (تفاعل دوائي داخل الجسم، وتضاعف الآثار الخطرة).",
      "إن كان المقصود إعطاء مريض، فالخطر الجسدي هو الأساس — ولا تستنتج الأمان من غياب تفاعل في الوعاء.",
    ].join("\n");
    const result = await postChatDirect(
      base,
      provider.apiKey.trim(),
      provider.model,
      LAB_SYSTEM + SAFETY_RULES,
      user,
    );
    if (!result.ok) {
      const error = await refineNetworkError(base, result.error);
      return { ok: false, error: arabicError(error, result.detail) };
    }
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
    if (!result.ok) {
      const error = await refineNetworkError(base, result.error);
      return { ok: false, error: arabicError(error, result.detail) };
    }
    return { ok: true, content: result.content };
  } catch (error) {
    return { ok: false, error: fromThrow(error) };
  }
}
