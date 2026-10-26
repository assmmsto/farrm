/**
 * Provider transport layer — the single place that turns an HTTP call into a
 * response, for BOTH runtimes:
 *
 *  · NATIVE (the APK): calls the CapacitorHttp plugin EXPLICITLY instead of
 *    relying on Capacitor's implicit `window.fetch` patch. Why, verified in the
 *    shipped sources (node_modules/@capacitor/android …/native-bridge.js +
 *    WebViewLocalServer.java):
 *      - the fetch patch rewrites GET/HEAD into a same-origin "interceptor" URL
 *        that the WebView then re-issues; on that path Chromium is known to
 *        strip headers (Capacitor itself patches around a User-Agent bug at
 *        WebViewLocalServer:299), so Authorization travelled through a fragile
 *        detour;
 *      - the explicit plugin call passes method/headers/body straight to the
 *        native bridge (nativePromise → CapacitorHttp.request → HttpURLConnection)
 *        with no WebView rewriting and therefore no CORS and no header games.
 *
 *  · WEB (the single HTML file in a browser): plain fetch. Browsers enforce
 *    CORS here, so a provider without Access-Control-Allow-Origin headers can
 *    never be called from this runtime — that is a browser law, not a bug we
 *    can code around. The UI explains the three working routes instead.
 *
 * Compatibility: AbortSignal.timeout() is missing on older WebViews, so the
 * timeout is implemented with AbortController + setTimeout.
 */

export type HttpResult = { status: number; text: string; url: string };

type RequestInput = {
  url: string;
  method: "GET" | "POST";
  headers: Record<string, string>;
  body?: string;
  timeoutMs: number;
};

type NativeHttpPlugin = {
  request: (options: {
    url: string;
    method: string;
    headers: Record<string, string>;
    data?: string;
    connectTimeout?: number;
    readTimeout?: number;
  }) => Promise<{ status: number; data: unknown; url?: string; headers?: Record<string, string> }>;
};

type CapacitorGlobal = {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
  Plugins?: Record<string, unknown>;
};

function capacitorGlobal(): CapacitorGlobal | null {
  const value = (globalThis as { Capacitor?: CapacitorGlobal }).Capacitor;
  return value && typeof value === "object" ? value : null;
}

/** True inside the packaged APK (also true for a stubbed Capacitor in tests). */
export function isNativeRuntime(): boolean {
  const cap = capacitorGlobal();
  try {
    if (typeof cap?.isNativePlatform === "function") return cap.isNativePlatform() === true;
    if (typeof cap?.getPlatform === "function") return cap.getPlatform() !== "web";
  } catch {
    return false;
  }
  return false;
}

function nativePlugin(): NativeHttpPlugin | null {
  const plugin = capacitorGlobal()?.Plugins?.CapacitorHttp as NativeHttpPlugin | undefined;
  if (plugin && typeof plugin.request === "function") return plugin;
  return null;
}

async function timeoutSignal(timeoutMs: number): Promise<{ signal: AbortSignal; done: () => void }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    done: () => clearTimeout(timer),
  };
}

export async function httpRequest(input: RequestInput): Promise<HttpResult> {
  const plugin = isNativeRuntime() ? nativePlugin() : null;

  if (plugin) {
    const response = await plugin.request({
      url: input.url,
      method: input.method,
      headers: input.headers,
      data: input.body,
      connectTimeout: input.timeoutMs,
      readTimeout: input.timeoutMs,
    });
    const raw = response?.data;
    const text =
      typeof raw === "string" ? raw : raw === undefined || raw === null ? "" : JSON.stringify(raw);
    return { status: Number(response?.status ?? 0), text, url: response?.url ?? input.url };
  }

  const { signal, done } = await timeoutSignal(input.timeoutMs);
  try {
    const response = await fetch(input.url, {
      method: input.method,
      headers: input.headers,
      body: input.body,
      cache: "no-store",
      signal,
    });
    const text = await response.text();
    return { status: response.status, text, url: response.url || input.url };
  } finally {
    done();
  }
}
