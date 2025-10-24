import { defineConfig, devices } from '@playwright/test';

const PORT = Number.parseInt(process.env.WEB_PORT ?? '5173', 10);

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: {
    timeout: 5_000
  },
  retries: process.env.CI ? 2 : 0,
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'artifacts/playwright-report' }]
  ],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${PORT}`,
    trace: 'on-first-retry',
    video: process.env.CI ? 'retain-on-failure' : 'on-first-retry',
    screenshot: 'only-on-failure'
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    },
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 7'] }
    }
  ],
  webServer: {
    command: 'npm run dev:web',
    reuseExistingServer: !process.env.CI,
    port: PORT,
    timeout: 120_000
  }
});
