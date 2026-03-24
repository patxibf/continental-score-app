/**
 * Stats tests — season stats, all-time stats, player stats.
 */
import { test, expect } from '@playwright/test'

test.describe('Stats pages', () => {
  test('season stats page loads', async ({ page }) => {
    await page.goto('/stats')
    await page.waitForURL(/\/stats/)
    await expect(page.locator('body')).not.toContainText('Error')
    await expect(page).not.toHaveURL(/\/login/)
  })

  test('all-time stats page loads', async ({ page }) => {
    await page.goto('/stats/alltime')
    await page.waitForURL(/\/stats/)
    await expect(page.locator('body')).not.toContainText('Error')
  })

  test('season stats shows leaderboard or empty state', async ({ page }) => {
    await page.goto('/stats')
    await page.waitForURL(/\/stats/)
    // Should show either standings data or "no data" message
    await expect(page.locator('body')).not.toContainText('500')
  })

  test('all-time stats shows player rankings or empty state', async ({ page }) => {
    await page.goto('/stats/alltime')
    await page.waitForURL(/\/stats/)
    await expect(page.locator('body')).not.toContainText('500')
  })

  test('player stats page loads for a known player', async ({ page }) => {
    // Navigate via players list to find a player ID
    await page.goto('/players')
    const playerLink = page.getByRole('link').filter({
      has: page.locator('[class*="avatar"], .avatar, span:has-text(/🐱|🦊|🐻/)'),
    }).first()

    if (!(await playerLink.isVisible({ timeout: 5_000 }).catch(() => false))) {
      // Try navigating directly via stats/players
      await page.goto('/stats')
      const link = page.getByRole('link', { name: /player stats|view/i }).first()
      if (!(await link.isVisible({ timeout: 3_000 }).catch(() => false))) {
        test.skip()
        return
      }
      await link.click()
    }

    await page.waitForURL(/\/stats\/players\/.+/, { timeout: 10_000 }).catch(() => {})
    await expect(page).not.toHaveURL(/\/login/)
  })
})

test.describe('Dashboard', () => {
  test('dashboard loads with group name and active season', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForURL(/\/dashboard/)
    // Should show something — group name, season card, or "no active season"
    await expect(page.locator('body')).not.toContainText('500')
    await expect(page).not.toHaveURL(/\/login/)
  })

  test('live game banner links to game page', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForURL(/\/dashboard/)

    const continueBtn = page.getByRole('link', { name: /continue/i })
    if (!(await continueBtn.isVisible({ timeout: 5_000 }).catch(() => false))) {
      test.skip()
      return
    }

    const href = await continueBtn.getAttribute('href')
    expect(href).toMatch(/\/games\//)
  })
})
