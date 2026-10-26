export function isPrivateIp(ip: string): boolean {
  const lower = ip.toLowerCase().replace(/^\[|\]$/g, "").split("%")[0] ?? "";
  if (lower.startsWith("::ffff:")) return isPrivateIp(lower.slice(7));

  if (lower.includes(":")) {
    if (lower === "::" || lower === "::1") return true;
    if (lower.startsWith("::ffff:")) return isPrivateIp(lower.slice(7));
    const head = lower.split(":")[0] ?? "";
    if (!head) return false;
    const value = Number.parseInt(head, 16);
    if (!Number.isFinite(value)) return true;
    if (value >= 0xfc00 && value <= 0xfdff) return true;
    if (value >= 0xfe80 && value <= 0xfebf) return true;
    if (value >= 0xff00) return true;
    return false;
  }

  const parts = lower.split(".");
  if (parts.length !== 4) return false;
  const nums = parts.map((part) => Number(part));
  if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const a = nums[0] ?? 0;
  const b = nums[1] ?? 0;
  if (a === 0 || a === 10 || a === 127 || a === 255) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

export function isBlockedHostname(host: string): boolean {
  const name = host.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (!name) return true;
  if (
    name === "localhost" ||
    name.endsWith(".localhost") ||
    name.endsWith(".local") ||
    name.endsWith(".internal")
  ) {
    return true;
  }
  if (name.includes(":")) return isPrivateIp(name);
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(name)) return isPrivateIp(name);
  return false;
}

export function isIpLiteral(host: string): boolean {
  const name = host.replace(/^\[|\]$/g, "");
  if (name.includes(":")) return true;
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(name);
}

export function normalizeBase(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error("invalid_url");
  }
  if (url.protocol !== "https:") throw new Error("https_only");
  if (url.username || url.password) throw new Error("invalid_url");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isBlockedHostname(host)) throw new Error("blocked_host");

  url.hash = "";
  url.search = "";
  let path = url.pathname.replace(/\/+$/, "");
  path = path.replace(/\/chat\/completions$/i, "");
  path = path.replace(/\/models$/i, "");
  path = path.replace(/\/+$/, "");
  url.pathname = path || "/";
  return url.toString().replace(/\/$/, "");
}
