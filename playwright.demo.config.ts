import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  testMatch: "public-demo.spec.ts",
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
        command: "npm run preview -- --host 127.0.0.1 --port 4177 --strictPort",
        url: "http://127.0.0.1:4177",
        reuseExistingServer: false,
      },
});
