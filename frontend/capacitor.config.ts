import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "kr.safeeta.mobile",
  appName: "SafeETA",
  webDir: "../app/frontend",
  bundledWebRuntime: false,
  server: {
    androidScheme: "https",
    cleartext: true,
  },
};

export default config;
