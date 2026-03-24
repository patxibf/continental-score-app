import { test as base, expect } from '@playwright/test'

/** Shared helpers available in all tests */
export const test = base.extend<{
  /** Navigate to dashboard and return the page, asserting load succeeded */
  dashboardPage: ReturnType<typeof base.extend>
}>({})

/** Random suffix for unique test data names */
export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

export { expect }
