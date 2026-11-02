import type { CapacitorConfig } from "@capacitor/cli";

// The numnum app (App Store / Google Play): a native shell around numnum.me, so updates to the
// website reach the app right away. "NumnumApp" in the user agent lets the site know it's
// running inside the app (no "add to home screen" prompts there).
const config: CapacitorConfig = {
  appId: "me.numnum.app",
  appName: "numnum",
  webDir: "app-shell",
  server: {
    url: process.env.CAP_SERVER_URL || "https://numnum.me",
    androidScheme: "https",
    errorPath: "index.html",
  },
  appendUserAgent: "NumnumApp/1",
  backgroundColor: "#ff5412",
  android: { allowMixedContent: false },
  ios: { contentInset: "never", limitsNavigationsToAppBoundDomains: false },
  plugins: {
    SplashScreen: { launchShowDuration: 900, backgroundColor: "#ff5412", showSpinner: false },
  },
};

export default config;
