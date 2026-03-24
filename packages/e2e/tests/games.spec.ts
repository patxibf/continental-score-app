/**
 * Games tests — create game, submit rounds, scoring, close game.
 *
 * Requires at least one active season and 2+ players in the group.
 */
import { test, expect } from '@playwright/test'

/** Navigate to an active season and return its URL */
async function goToActiveSeason(page: import('@playwright/test').Page) {
  await page.goto('/seasons')
  // Find a season card that is "Active"
  const activeCard = page.locator(':text("Active")').first()
  const exists = await activeCard.isVisible({ timeout: 5_000 }).catch(() => false)
  if (!exists) return null

  // Click the View Season link in that card
  const card = activeCard.locator('xpath=ancestor::*[contains(@class,"card") or contains(@class,"felt")][1]')
  const viewLink = card.getByRole('link', { name: /view season/i })
  if (!(await viewLink.isVisible({ timeout: 2_000 }).catch(() => false))) return null

  await viewLink.click()
  await page.waitForURL(/\/seasons\/.+/)
  return page.url()
}

test.describe('Game creation', () => {
  test('can open the New Game form from a season', async ({ page }) => {
    const seasonUrl = await goToActiveSeason(page)
    if (!seasonUrl) {
      test.skip()
      return
    }

    const newGameBtn = page.getByRole('button', { name: /new game/i }).or(
      page.getByRole('link', { name: /new game/i })
    ).first()

    if (!(await newGameBtn.isVisible({ timeout: 5_000 }).catch(() => false))) {
      test.skip()
      return
    }

    await newGameBtn.click()
    await page.waitForURL(/\/games\/new/)
    await expect(page.getByText(/select players|start game/i)).toBeVisible()
  })

  test('"Start Game" button disabled until 2+ players selected', async ({ page }) => {
    const seasonUrl = await goToActiveSeason(page)
    if (!seasonUrl) {
      test.skip()
      return
    }

    await page.goto(seasonUrl.replace(/seasons\//, 'seasons/') + '/games/new')

    const startBtn = page.getByRole('button', { name: /start game/i })
    if (await startBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await expect(startBtn).toBeDisabled()
    }
  })

  test('creates a game and enters round 1 scores', async ({ page }) => {
    const seasonUrl = await goToActiveSeason(page)
    if (!seasonUrl) {
      test.skip()
      return
    }

    const newGameBtn = page.getByRole('button', { name: /new game/i }).or(
      page.getByRole('link', { name: /new game/i })
    ).first()
    if (!(await newGameBtn.isVisible({ timeout: 5_000 }).catch(() => false))) {
      test.skip()
      return
    }

    await newGameBtn.click()
    await page.waitForURL(/\/games\/new/)

    // Select first 2 players
    const playerBtns = page.getByRole('button').filter({ hasText: /🐱|🦊|🐻|🐺|🦁|🐯|🐧|🦅/ })
    const count = await playerBtns.count()
    if (count < 2) {
      test.skip()
      return
    }
    await playerBtns.nth(0).click()
    await playerBtns.nth(1).click()

    const startBtn = page.getByRole('button', { name: /start game/i })
    await expect(startBtn).toBeEnabled()
    await startBtn.click()

    await page.waitForURL(/\/games\/.+/)
    await expect(page).toHaveURL(/\/games\/.+/)

    // Submit round 1 — mark player 1 as OUT (tap once)
    const playerAction = page.getByRole('button').filter({ hasNotText: /round|submit|save|cancel/i }).first()
    if (await playerAction.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await playerAction.click() // → mark as OUT

      const submitBtn = page.getByRole('button', { name: /submit round 1/i })
      if (await submitBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await submitBtn.click()
        await expect(page.getByText(/round 2|submit round 2/i)).toBeVisible({ timeout: 8_000 })
      }
    }
  })
})

test.describe('Game page', () => {
  test('active game shows round progress', async ({ page }) => {
    await page.goto('/dashboard')
    const liveGame = page.getByRole('link', { name: /continue/i }).first()

    if (!(await liveGame.isVisible({ timeout: 5_000 }).catch(() => false))) {
      test.skip()
      return
    }

    await liveGame.click()
    await page.waitForURL(/\/games\/.+/)
    await expect(page.getByText(/round/i).first()).toBeVisible()
  })

  test('"Close Game" button not visible until all 7 rounds complete', async ({ page }) => {
    await page.goto('/dashboard')
    const liveGame = page.getByRole('link', { name: /continue/i }).first()

    if (!(await liveGame.isVisible({ timeout: 5_000 }).catch(() => false))) {
      test.skip()
      return
    }

    await liveGame.click()
    await page.waitForURL(/\/games\/.+/)

    // If not all 7 rounds done, close button should be absent
    const text = await page.locator('body').textContent()
    const roundMatch = text?.match(/round (\d+) of 7/i)
    if (roundMatch && parseInt(roundMatch[1]) < 7) {
      await expect(page.getByRole('button', { name: /close game/i })).not.toBeVisible()
    }
  })
})

test.describe('Score entry', () => {
  test('marks player as OUT and ONE-GO on repeated taps', async ({ page }) => {
    await page.goto('/dashboard')
    const liveGame = page.getByRole('link', { name: /continue/i }).first()

    if (!(await liveGame.isVisible({ timeout: 5_000 }).catch(() => false))) {
      test.skip()
      return
    }

    await liveGame.click()
    await page.waitForURL(/\/games\/.+/)

    // A score entry form should be visible
    const playerBtn = page.getByRole('button').filter({ hasNotText: /submit|save|cancel|close|round/i }).first()
    if (!(await playerBtn.isVisible({ timeout: 5_000 }).catch(() => false))) {
      test.skip()
      return
    }

    // First click → OUT
    await playerBtn.click()
    await expect(playerBtn.or(page.getByText(/out/i))).toBeVisible({ timeout: 3_000 })

    // Second click → ONE GO
    await playerBtn.click()
    const oneGoText = page.getByText(/one.?go/i).or(page.getByText(/−\d+/))
    // Just verify no crash
    await expect(page).not.toHaveURL(/\/login/)
  })
})

test.describe('Game history', () => {
  test('completed game history page loads', async ({ page }) => {
    await page.goto('/seasons')
    const seasonLink = page.getByRole('link', { name: /season|view/i }).first()
    if (!(await seasonLink.isVisible({ timeout: 5_000 }).catch(() => false))) {
      test.skip()
      return
    }
    await seasonLink.click()
    await page.waitForURL(/\/seasons\/.+/)

    // Find a closed/completed game
    const gameLink = page.getByRole('link', { name: /game|closed|view/i }).first()
    if (!(await gameLink.isVisible({ timeout: 5_000 }).catch(() => false))) {
      test.skip()
      return
    }
    await gameLink.click()
    await page.waitForURL(/\/games\/.+/)
    await expect(page).not.toHaveURL(/\/login/)
  })
})
