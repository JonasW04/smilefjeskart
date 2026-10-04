import { defineConfig } from "@playwright/test";

const externalBaseURL = process.env.PLAYWRIGHT_BASE_URL;
const baseURL = externalBaseURL ?? "http://127.0.0.1:3042";

export default defineConfig({
  testDir: "./e2e",
  forbidOnly: Boolean(process.env.CI),
  workers: 1,
  retries: 0,
  timeout: 30_000,
  reporter: "list",
  use: {
    baseURL,
    browserName: "chromium",
    viewport: { width: 1280, height: 800 },
    reducedMotion: "no-preference",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: {
      // CI machines also exercise the real WebGL renderer through SwiftShader.
      args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
    },
  },
  webServer: externalBaseURL ? undefined : {
    command: "npm run start -- --hostname 127.0.0.1 --port 3042",
    url: baseURL,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
