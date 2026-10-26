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
};

export default config;
