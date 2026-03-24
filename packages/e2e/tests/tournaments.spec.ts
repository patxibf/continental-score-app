/**
 * Tournament tests — list, wizard (all 4 steps), detail view.
 */
import { test, expect } from '@playwright/test'
import { uid } from '../fixtures/auth'

test.describe('Tournament list', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tournaments')
    await page.waitForURL(/\/tournaments$/)
  })

  test('loads the tournaments page', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: /tournament/i }).or(page.getByText(/tournament/i).first())
    ).toBeVisible()
  })

  test('shows "New Tournament" button for admin', async ({ page }) => {
    // Admin or group-admin should see the button
    const btn = page.getByRole('link', { name: /new tournament/i }).or(
      page.getByRole('button', { name: /new tournament/i })
    )
    await expect(btn).toBeVisible()
  })

  test('shows empty state or existing tournaments', async ({ page }) => {
    // Either no tournaments or a list — neither should be an error
    await expect(page.locator('body')).not.toContainText('Error')
    await expect(page).not.toHaveURL(/\/login/)
  })
})

test.describe('Tournament creation wizard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tournaments/new')
    await page.waitForURL(/\/tournaments\/new/)
  })

  // ─── Step 1 ──────────────────────────────────────────────────────────────

  test('step 1 shows name input and player list', async ({ page }) => {
    await expect(page.getByPlaceholder(/tournament name/i)).toBeVisible()
    await expect(page.getByText(/select players|minimum 3/i).first()).toBeVisible()
  })

  test('"Next" is disabled without a name and 3+ players', async ({ page }) => {
    const nextBtn = page.getByRole('button', { name: /next/i })
    await expect(nextBtn).toBeDisabled()
  })

  test('"Next" stays disabled with name but fewer than 3 players', async ({ page }) => {
    await page.getByPlaceholder(/tournament name/i).fill('Test Tournament')
    // Select only 2 players (if available)
    const players = page.getByRole('button').filter({ hasText: /🐱|🦊|🐻|🐺|🦁|🐯|🐧|🦅/ })
    const count = await players.count()
    if (count >= 1) await players.nth(0).click()
    if (count >= 2) await players.nth(1).click()

    const nextBtn = page.getByRole('button', { name: /next/i })
    await expect(nextBtn).toBeDisabled()
  })

  test('shows step indicator "Step 1 of 4"', async ({ page }) => {
    await expect(page.getByText(/step 1 of 4/i)).toBeVisible()
  })

  // ─── Step 1 → 2 ─────────────────────────────────────────────────────────

  test('advances to step 2 bracket preview with valid step 1', async ({ page }) => {
    const players = page.getByRole('button').filter({ hasText: /🐱|🦊|🐻|🐺|🦁|🐯|🐧|🦅/ })
    const count = await players.count()

    if (count < 3) {
      test.skip()
      return
    }

    await page.getByPlaceholder(/tournament name/i).fill(`Tourney-${uid()}`)
    await players.nth(0).click()
    await players.nth(1).click()
    await players.nth(2).click()

    await page.getByRole('button', { name: /next/i }).click()

    // Step 2: bracket preview
    await expect(
      page.getByText(/bracket|proposed|tables|final/i).first()
    ).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText(/step 2 of 4/i)).toBeVisible()
  })

  // ─── Step 2 → 3 ─────────────────────────────────────────────────────────

  test('step 3 shows R1–R7 toggle buttons', async ({ page }) => {
    const players = page.getByRole('button').filter({ hasText: /🐱|🦊|🐻|🐺|🦁|🐯|🐧|🦅/ })
    const count = await players.count()
    if (count < 3) {
      test.skip()
      return
    }

    await page.getByPlaceholder(/tournament name/i).fill(`Tourney-${uid()}`)
    for (let i = 0; i < Math.min(3, count); i++) await players.nth(i).click()
    await page.getByRole('button', { name: /next/i }).click() // → step 2

    await page.waitForSelector(':text("step 2 of 4")', { timeout: 10_000 }).catch(() => {})
    await page.getByRole('button', { name: /next/i }).click() // → step 3

    // Step 3: configure rounds
    await expect(page.getByText(/step 3 of 4/i)).toBeVisible({ timeout: 8_000 })
    await expect(page.getByRole('button', { name: 'R5' }).first()).toBeVisible()
  })

  // ─── Step 3 → 4 ─────────────────────────────────────────────────────────

  test('step 4 shows review summary and "Start Tournament" button', async ({ page }) => {
    const players = page.getByRole('button').filter({ hasText: /🐱|🦊|🐻|🐺|🦁|🐯|🐧|🦅/ })
    const count = await players.count()
    if (count < 3) {
      test.skip()
      return
    }

    const name = `Tourney-${uid()}`
    await page.getByPlaceholder(/tournament name/i).fill(name)
    for (let i = 0; i < Math.min(3, count); i++) await players.nth(i).click()

    await page.getByRole('button', { name: /next/i }).click() // → 2
    await page.waitForSelector(':text("step 2 of 4")', { timeout: 10_000 }).catch(() => {})
    await page.getByRole('button', { name: /next/i }).click() // → 3
    await page.waitForSelector(':text("step 3 of 4")', { timeout: 8_000 }).catch(() => {})
    await page.getByRole('button', { name: /next/i }).click() // → 4

    await expect(page.getByText(/step 4 of 4/i)).toBeVisible({ timeout: 8_000 })
    await expect(page.getByRole('button', { name: /start tournament/i })).toBeVisible()
    await expect(page.getByText(name)).toBeVisible()
  })

  // ─── Full creation ────────────────────────────────────────────────────────

  test('creates a tournament and lands on detail page', async ({ page }) => {
    const players = page.getByRole('button').filter({ hasText: /🐱|🦊|🐻|🐺|🦁|🐯|🐧|🦅/ })
    const count = await players.count()
    if (count < 3) {
      test.skip()
      return
    }

    const name = `Tourney-${uid()}`
    await page.getByPlaceholder(/tournament name/i).fill(name)
    for (let i = 0; i < Math.min(3, count); i++) await players.nth(i).click()

    await page.getByRole('button', { name: /next/i }).click()
    await page.waitForSelector(':text("step 2 of 4")', { timeout: 10_000 }).catch(() => {})
    await page.getByRole('button', { name: /next/i }).click()
    await page.waitForSelector(':text("step 3 of 4")', { timeout: 8_000 }).catch(() => {})
    await page.getByRole('button', { name: /next/i }).click()
    await page.waitForSelector(':text("step 4 of 4")', { timeout: 8_000 }).catch(() => {})

    await page.getByRole('button', { name: /start tournament/i }).click()

    // Should redirect to /tournaments/:id
    await page.waitForURL(/\/tournaments\/.+/, { timeout: 15_000 })
    await expect(page).toHaveURL(/\/tournaments\/.+/)
    await expect(page.getByText(name)).toBeVisible({ timeout: 8_000 })
  })

  // ─── Negative ────────────────────────────────────────────────────────────

  test('"Back" on step 2 returns to step 1', async ({ page }) => {
    const players = page.getByRole('button').filter({ hasText: /🐱|🦊|🐻|🐺|🦁|🐯|🐧|🦅/ })
    const count = await players.count()
    if (count < 3) {
      test.skip()
      return
    }

    await page.getByPlaceholder(/tournament name/i).fill('Test')
    for (let i = 0; i < 3; i++) await players.nth(i).click()
    await page.getByRole('button', { name: /next/i }).click()
    await page.waitForSelector(':text("step 2 of 4")', { timeout: 10_000 }).catch(() => {})

    await page.getByRole('button', { name: /back/i }).click()
    await expect(page.getByText(/step 1 of 4/i)).toBeVisible({ timeout: 5_000 })
  })
})

test.describe('Tournament detail', () => {
  test('detail page shows tournament name and status', async ({ page }) => {
    await page.goto('/tournaments')
    const tournamentLink = page.getByRole('link').filter({ has: page.locator(':text("In Progress"), :text("Completed")') }).first()

    if (!(await tournamentLink.isVisible({ timeout: 5_000 }).catch(() => false))) {
      test.skip()
      return
    }

    await tournamentLink.click()
    await page.waitForURL(/\/tournaments\/.+/)
    await expect(page.getByText(/in progress|completed/i).first()).toBeVisible()
  })

  test('detail page shows table cards with player names', async ({ page }) => {
    await page.goto('/tournaments')
    const tournamentLink = page.getByRole('link').filter({ has: page.locator(':text("In Progress")') }).first()

    if (!(await tournamentLink.isVisible({ timeout: 5_000 }).catch(() => false))) {
      test.skip()
      return
    }

    await tournamentLink.click()
    await page.waitForURL(/\/tournaments\/.+/)
    await expect(page.getByText(/table \d+/i).first()).toBeVisible({ timeout: 8_000 })
  })
})
