import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  use: {
    baseURL: "http://127.0.0.1:4186",
    trace: "retain-on-failure",
    launchOptions: process.env.CHROME_EXECUTABLE
      ? { executablePath: process.env.CHROME_EXECUTABLE }
      : undefined,
  },
  webServer: {
    command: "npm start",
    url: "http://127.0.0.1:4186",
    reuseExistingServer: false,
  },
});
