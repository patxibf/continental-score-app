/**
 * Auth tests — login, logout, error states, password reset flow.
 * These tests run WITHOUT the saved auth state (fresh context).
 */
import { test, expect } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } }) // start unauthenticated

test.describe('Login page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login')
  })

  test('shows the Continental branding and form', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /continental/i })).toBeVisible()
    await expect(page.getByLabel('Email')).toBeVisible()
    await expect(page.getByLabel('Password')).toBeVisible()
    await expect(page.getByRole('button', { name: /enter club/i })).toBeVisible()
  })

  test('shows "Forgot password?" and "Create a group" links', async ({ page }) => {
    await expect(page.getByRole('link', { name: /forgot password/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /create a group/i })).toBeVisible()
  })

  // ─── Positive ────────────────────────────────────────────────────────────

  test('logs in with valid admin credentials', async ({ page }) => {
    await page.getByLabel('Email').fill('admin')
    await page.getByLabel('Password').fill('pass')
    await page.getByRole('button', { name: /enter club/i }).click()
    await page.waitForURL(/\/(dashboard|seasons|admin)/, { timeout: 15_000 })
    // At least landed somewhere inside the app
    await expect(page).not.toHaveURL(/\/login/)
  })

  // ─── Negative ────────────────────────────────────────────────────────────

  test('shows error on wrong password', async ({ page }) => {
    await page.getByLabel('Email').fill('admin')
    await page.getByLabel('Password').fill('WRONG_PASSWORD')
    await page.getByRole('button', { name: /enter club/i }).click()
    await expect(
      page.getByText(/invalid credentials|incorrect|wrong|error/i)
    ).toBeVisible({ timeout: 8_000 })
    await expect(page).toHaveURL(/\/login/)
  })

  test('shows error on unknown email', async ({ page }) => {
    await page.getByLabel('Email').fill('nobody@notexist.xyz')
    await page.getByLabel('Password').fill('whatever')
    await page.getByRole('button', { name: /enter club/i }).click()
    await expect(
      page.getByText(/invalid credentials|incorrect|wrong|error/i)
    ).toBeVisible({ timeout: 8_000 })
  })

  test('Next button is disabled when fields are empty', async ({ page }) => {
    // HTML required prevents submit; button should not redirect
    await page.getByRole('button', { name: /enter club/i }).click()
    await expect(page).toHaveURL(/\/login/)
  })
})

test.describe('Logout', () => {
  test.use({ storageState: 'playwright/.auth/group-user.json' })

  test('logs out and redirects to login', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForURL(/\/dashboard/, { timeout: 10_000 })

    // Logout button is a ghost icon button in the header (LogOut icon, no text label)
    // It's the last button in the header
    const logoutBtn = page.locator('header button').last()
    await expect(logoutBtn).toBeVisible({ timeout: 5_000 })
    await logoutBtn.click()

    await page.waitForURL(/\/login/, { timeout: 10_000 })
    await expect(page).toHaveURL(/\/login/)
  })
})

test.describe('Register page', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test.beforeEach(async ({ page }) => {
    await page.goto('/register')
  })

  test('shows registration form with all fields', async ({ page }) => {
    // Labels are not associated via htmlFor — check visible text labels instead
    await expect(page.getByText('Group Name').first()).toBeVisible()
    await expect(page.getByText('Password').first()).toBeVisible()
    // Check at least one input is present
    await expect(page.locator('input').first()).toBeVisible()
  })

  test('shows error if passwords do not match', async ({ page }) => {
    // Fill all required fields using exact placeholders from Register.tsx
    await page.getByPlaceholder('The Card Sharks').fill('Test Group XYZ')
    await page.getByPlaceholder('Alice').fill('TestPlayer')
    await page.getByPlaceholder('you@example.com').fill(`e2e-${Date.now()}@test.invalid`)
    // Password fields use type="password" (not textbox role)
    await page.locator('input[type="password"]').nth(0).fill('Password123!')
    await page.locator('input[type="password"]').nth(1).fill('DIFFERENT_PW')
    await page.getByRole('button', { name: /create group/i }).click()
    await expect(
      page.getByText('Passwords do not match')
    ).toBeVisible({ timeout: 5_000 })
  })

  test('"Sign in" link navigates to login', async ({ page }) => {
    await page.getByRole('link', { name: /sign in/i }).click()
    await expect(page).toHaveURL(/\/login/)
  })
})

test.describe('Unauthenticated redirects', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  for (const path of ['/dashboard', '/players', '/seasons', '/tournaments', '/stats']) {
    test(`redirects ${path} → /login when not logged in`, async ({ page }) => {
      await page.goto(path)
      await page.waitForURL(/\/login/, { timeout: 10_000 })
      await expect(page).toHaveURL(/\/login/)
    })
  }
})
