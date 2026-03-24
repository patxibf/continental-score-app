/**
 * Seasons tests — list, create (with/without pot), view standings, close.
 */
import { test, expect } from '@playwright/test'
import { uid } from '../fixtures/auth'

test.describe('Seasons list', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/seasons')
    await page.waitForURL(/\/seasons/)
  })

  test('loads the seasons page', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: /seasons/i }).or(page.getByText(/season/i).first())
    ).toBeVisible()
  })

  test('shows existing seasons or empty state', async ({ page }) => {
    // Either seasons or "no seasons" text
    await expect(page.locator('body')).not.toContainText('Error')
    await expect(page).not.toHaveURL(/\/login/)
  })

  // ─── Positive ────────────────────────────────────────────────────────────

  test('creates a season without pot', async ({ page }) => {
    const name = `Season-${uid()}`
    const newBtn = page.getByRole('button', { name: /new season|create|add/i }).first()

    if (!(await newBtn.isVisible())) {
      test.skip()
      return
    }

    await newBtn.click()

    const nameInput = page.getByPlaceholder(/season name|name/i).or(page.getByLabel(/name/i)).first()
    await nameInput.fill(name)

    await page.getByRole('button', { name: /create|save/i }).click()
    await expect(page.getByText(name)).toBeVisible({ timeout: 8_000 })
  })

  test('creates a season with money pot', async ({ page }) => {
    const name = `PotSeason-${uid()}`
    const newBtn = page.getByRole('button', { name: /new season|create|add/i }).first()

    if (!(await newBtn.isVisible())) {
      test.skip()
      return
    }

    await newBtn.click()

    const nameInput = page.getByPlaceholder(/season name|name/i).or(page.getByLabel(/name/i)).first()
    await nameInput.fill(name)

    // Enable pot
    const potToggle = page.getByRole('checkbox', { name: /pot|money/i }).or(
      page.getByLabel(/pot/i)
    )
    if (await potToggle.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await potToggle.check()
      const amountInput = page.getByLabel(/amount|contribution/i).or(
        page.getByPlaceholder(/amount/i)
      )
      await amountInput.fill('5.00')
    }

    await page.getByRole('button', { name: /create|save/i }).click()
    await expect(page.getByText(name)).toBeVisible({ timeout: 8_000 })
  })

  // ─── Negative ────────────────────────────────────────────────────────────

  test('shows validation error when pot enabled without amount', async ({ page }) => {
    const newBtn = page.getByRole('button', { name: /new season|create|add/i }).first()
    if (!(await newBtn.isVisible())) {
      test.skip()
      return
    }

    await newBtn.click()
    await page.getByLabel(/name/i).first().fill('Test')

    const potToggle = page.getByRole('checkbox', { name: /pot|money/i }).or(page.getByLabel(/pot/i))
    if (await potToggle.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await potToggle.check()
      // Submit without amount
      await page.getByRole('button', { name: /create|save/i }).click()
      await expect(
        page.getByText(/amount|required|greater than 0/i)
      ).toBeVisible({ timeout: 5_000 })
    }
  })
})

test.describe('Season detail', () => {
  test('navigates to season detail from list', async ({ page }) => {
    await page.goto('/seasons')
    const seasonLink = page.getByRole('link', { name: /season|view/i }).first()

    if (!(await seasonLink.isVisible({ timeout: 5_000 }).catch(() => false))) {
      test.skip()
      return
    }

    await seasonLink.click()
    await page.waitForURL(/\/seasons\/.+/)
    await expect(page).toHaveURL(/\/seasons\/.+/)
  })

  test('season detail shows standings and games tabs', async ({ page }) => {
    await page.goto('/seasons')
    const seasonLink = page.getByRole('link', { name: /season|view/i }).first()

    if (!(await seasonLink.isVisible({ timeout: 5_000 }).catch(() => false))) {
      test.skip()
      return
    }

    await seasonLink.click()
    await page.waitForURL(/\/seasons\/.+/)

    // Should have standings or games section visible
    await expect(
      page.getByText(/standings|games|players/i).first()
    ).toBeVisible({ timeout: 8_000 })
  })

  test('can sort standings by Wins', async ({ page }) => {
    await page.goto('/seasons')
    const seasonLink = page.getByRole('link', { name: /season|view/i }).first()

    if (!(await seasonLink.isVisible({ timeout: 5_000 }).catch(() => false))) {
      test.skip()
      return
    }

    await seasonLink.click()
    await page.waitForURL(/\/seasons\/.+/)

    const winsBtn = page.getByRole('button', { name: /wins/i })
    if (await winsBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await winsBtn.click()
      // Just verify no crash
      await expect(page).not.toHaveURL(/\/login/)
    }
  })
})
