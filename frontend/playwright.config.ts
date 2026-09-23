import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  workers: 1,
  timeout: 45_000,
  retries: 0,
  use: {
    baseURL: process.env.IFFY_UI_URL ?? "http://localhost:5175",
    viewport: { width: 1440, height: 1000 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: process.env.IFFY_CHROME_PATH
      ? { executablePath: process.env.IFFY_CHROME_PATH }
      : {},
  },
  reporter: "list",
});
