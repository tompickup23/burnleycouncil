import { test, expect } from '@playwright/test'

// Legal page — tab switching between legal sections
// Run: npx playwright test e2e/legal.spec.js

test.describe('Legal page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/legal')
    await expect(page.locator('#main-content')).toBeVisible({ timeout: 10_000 })
    // Wait for tabs to render (lazy-loaded component)
    await expect(page.locator('.legal-tab').first()).toBeVisible({ timeout: 10_000 })
  })

  test('renders legal tabs', async ({ page }) => {
    const tabs = page.locator('.legal-tab')
    expect(await tabs.count()).toBeGreaterThanOrEqual(3)
    // First tab should be active by default
    await expect(tabs.first()).toHaveClass(/active/)
  })

  test('clicking tab switches content', async ({ page }) => {
    const tabs = page.locator('.legal-tab')
    const count = await tabs.count()

    if (count >= 2) {
      // Get text of first tab's content
      const firstContent = await page.locator('.legal-content').textContent()

      // Click second tab
      await tabs.nth(1).click()
      await expect(tabs.nth(1)).toHaveClass(/active/)
      await expect(tabs.first()).not.toHaveClass(/active/)

      // Content should have changed
      const secondContent = await page.locator('.legal-content').textContent()
      expect(secondContent).not.toEqual(firstContent)
    }
  })

  test('all tabs render content without errors', async ({ page }) => {
    const errors = []
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text())
    })

    const tabs = page.locator('.legal-tab')
    const count = await tabs.count()

    for (let i = 0; i < count; i++) {
      await tabs.nth(i).click()
      await expect(tabs.nth(i)).toHaveClass(/active/)
      await expect(page.locator('.legal-content')).not.toBeEmpty()
    }

    const realErrors = errors.filter(e =>
      !e.includes('favicon') && !e.includes('net::') && !e.includes('manifest')
    )
    expect(realErrors).toHaveLength(0)
  })
})
