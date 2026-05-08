import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.bbaru.app",
  appName: "BBaru",
  webDir: "dist",
  server: {
    androidScheme: "https",
  },
};

export default config;
