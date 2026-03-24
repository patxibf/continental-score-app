import { defineConfig, devices } from '@playwright/test'

const BASE_URL = process.env.BASE_URL ?? 'https://d2f12kp396t6lu.cloudfront.net'

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false, // sequential — tests share prod state
  workers: 1, // single worker — avoid auth state race conditions
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['html', { open: 'never' }], ['list']],

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off',
  },

  projects: [
    // Setup: create saved auth state for group user
    {
      name: 'setup',
      testMatch: /global\.setup\.ts/,
    },
    // Main test suite — depends on setup
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'playwright/.auth/group-user.json',
      },
      dependencies: ['setup'],
      testIgnore: /global\.setup\.ts/,
    },
  ],
})
