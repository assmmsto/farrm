import type { CapacitorConfig } from "@capacitor/cli";

/**
 * The APK wraps the standalone static bundle (dist-standalone), which talks
 * directly to the user's own OpenAI-compatible proxy — no backend of ours.
 */
const config: CapacitorConfig = {
  appId: "com.personal.pharmacylab",
  appName: "مختبر الصيدلي",
  webDir: "capacitor-www",
  android: {
    // The WebView origin is https://localhost; without this an http:// proxy
    // on the local network (home NAS, Termux…) would be blocked as mixed content.
    allowMixedContent: true,
  },
  plugins: {
    CapacitorHttp: {
      // Route fetch through the NATIVE layer inside the APK → CORS stops
      // mattering entirely on Android (the browser-enforced CORS still applies
      // to the standalone HTML opened in a regular browser).
      enabled: true,
    },
  },
};

export default config;
