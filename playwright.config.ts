import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.e2e.spec.ts",
  workers: 1,
  use: {
    baseURL: "http://localhost:4173",
    viewport: { width: 1440, height: 1000 },
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "VITE_APP_MODE=demo npm run dev -- --port 4173 --strictPort",
      url: "http://localhost:4173",
      reuseExistingServer: false,
    },
    {
      command:
        "VITE_APP_MODE=live VITE_SUPABASE_URL=https://micole-test.supabase.co VITE_SUPABASE_PUBLISHABLE_KEY=public-test npm run dev -- --port 4174 --strictPort",
      url: "http://localhost:4174",
      reuseExistingServer: false,
    },
  ],
});
