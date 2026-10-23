import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  testMatch: ["bolivia-school.spec.ts", "public-demo.spec.ts", "staff-demo.spec.ts", "ux-attendance-demo.spec.ts", "workspace-centers.spec.ts"],
  workers: 1,
  timeout: 90000,
  outputDir: "test-results-demo",
  use: {
    baseURL: process.env.MICOLE_DEMO_TEST_URL || "http://127.0.0.1:4177",
    reducedMotion: "reduce",
    viewport: { width: 1440, height: 1000 },
    trace: "retain-on-failure",
  },
  webServer: process.env.MICOLE_DEMO_TEST_URL
    ? undefined
    : {
        command: "MICOLE_DEMO_LOCAL_TEST=1 node scripts/serve-demo.mjs",
        url: "http://127.0.0.1:4177",
        reuseExistingServer: false,
      },
});
