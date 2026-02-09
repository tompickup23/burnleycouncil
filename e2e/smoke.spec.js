import { test, expect } from '@playwright/test'

// Smoke tests — verify core pages load without crashing.
// Run: npx playwright test
// Requires a build first: VITE_COUNCIL=burnley VITE_BASE=/ npx vite build

const MAIN = '#main-content' // Layout.jsx <main id="main-content">

test.describe('Smoke tests', () => {
  test('Home page loads with main content', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator(MAIN)).toBeVisible()
    await expect(page.locator(MAIN)).not.toBeEmpty()
  })

  test('Spending page loads', async ({ page }) => {
    await page.goto('/spending')
    await expect(page.locator(MAIN)).toBeVisible({ timeout: 10_000 })
    await expect(page.locator(MAIN)).toContainText(/Spending|transaction/i)
  })

  test('DOGE page loads', async ({ page }) => {
    await page.goto('/doge')
    await expect(page.locator(MAIN)).toBeVisible({ timeout: 10_000 })
    // Wait for lazy-loaded content to appear
    await expect(page.locator(MAIN)).toContainText(/DOGE|Investigation|finding/i, { timeout: 10_000 })
  })

  test('About page loads', async ({ page }) => {
    await page.goto('/about')
    await expect(page.locator(MAIN)).toBeVisible()
    await expect(page.locator(MAIN)).not.toBeEmpty()
  })

  test('Budgets page loads', async ({ page }) => {
    await page.goto('/budgets')
    await expect(page.locator(MAIN)).toBeVisible({ timeout: 10_000 })
  })

  test('Cross-council page loads', async ({ page }) => {
    await page.goto('/cross-council')
    await expect(page.locator(MAIN)).toBeVisible({ timeout: 10_000 })
  })

  test('Navigation works — spending link from home', async ({ page }) => {
    await page.goto('/')
    const spendingLink = page.locator('a[href*="spending"]').first()
    if (await spendingLink.isVisible()) {
      await spendingLink.click()
      await expect(page).toHaveURL(/spending/)
    }
  })

  test('404 SPA fallback returns app shell', async ({ page }) => {
    await page.goto('/nonexistent-route-12345')
    // SPA routing — should not show a browser 404, should render the app
    await expect(page.locator('body')).not.toBeEmpty()
  })

  test('No console errors on home page', async ({ page }) => {
    const errors = []
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text())
    })
    await page.goto('/')
    await page.waitForTimeout(2000)
    // Filter out known benign errors (favicon, service worker, manifest, net errors from preview)
    const real = errors.filter(e =>
      !e.includes('favicon') && !e.includes('service-worker') &&
      !e.includes('manifest') && !e.includes('net::')
    )
    expect(real).toHaveLength(0)
  })
})
