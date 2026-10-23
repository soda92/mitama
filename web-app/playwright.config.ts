import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  reporter: "list",
  use: {
    baseURL: "http://localhost:8080",
    launchOptions: {
      executablePath: "/usr/bin/chromium",
      args: ["--no-sandbox"],
    },
  },
  webServer: {
    command: "go run ./cmd/server -addr :8080",
    cwd: "..",
    url: "http://localhost:8080/api/packs",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
