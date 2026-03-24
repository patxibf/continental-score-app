/**
 * Global setup — creates (or reuses) a test group + user account and saves auth state.
 *
 * The E2E user (`e2e-test@continental.test` / `e2ePassword123!`) is a group owner.
 * Email verification is NOT required to log in — the JWT includes full group context
 * even when `emailVerified = false`.  The frontend may show a verify-email banner
 * but all group-level pages are accessible.
 */

import { test as setup, request } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'

export const TEST_EMAIL = process.env.E2E_EMAIL ?? 'e2e-test@continental.test'
export const TEST_PASSWORD = process.env.E2E_PASSWORD ?? 'e2ePassword123!'
export const TEST_GROUP = 'E2E Test Group'
export const TEST_PLAYER = 'E2E Player'

const STORAGE_PATH = 'playwright/.auth/group-user.json'

setup('authenticate as group user', async ({ page }) => {
  fs.mkdirSync(path.dirname(STORAGE_PATH), { recursive: true })

  const api = await request.newContext({
    baseURL: process.env.BASE_URL ?? 'https://d2f12kp396t6lu.cloudfront.net',
  })

  // Register if not already registered (409 = already exists — fine)
  await api.post('/api/auth/register', {
    data: {
      groupName: TEST_GROUP,
      playerName: TEST_PLAYER,
      avatar: 'cat',
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
    },
  })
  await api.dispose()

  // Log in via browser — login succeeds even with emailVerified=false
  await page.goto('/login')
  await page.getByLabel('Email').fill(TEST_EMAIL)
  await page.getByLabel('Password').fill(TEST_PASSWORD)
  await page.getByRole('button', { name: /enter club/i }).click()

  // Wait for any page inside the app (including verify-email banner pages)
  await page.waitForURL(/\/(dashboard|seasons|players|tournaments|verify|settings)/, {
    timeout: 15_000,
  })

  // If still on login, the e2e user failed — hard error
  const url = page.url()
  if (url.includes('/login')) {
    throw new Error(`E2E user login failed. Current URL: ${url}`)
  }

  await page.context().storageState({ path: STORAGE_PATH })
})
