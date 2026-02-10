import { test, expect } from '@playwright/test'

// Navigation & Layout — sidebar, mobile menu, route transitions
// Run: npx playwright test e2e/navigation.spec.js

test.describe('Navigation', () => {
  test('sidebar nav links are visible on desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/')
    const sidebar = page.locator('.sidebar')
    await expect(sidebar).toBeVisible()
    const navItems = sidebar.locator('.nav-item')
    expect(await navItems.count()).toBeGreaterThan(3)
  })

  test('mobile menu opens sidebar', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/')
    await expect(page.locator('#main-content')).toBeVisible()

    const menuToggle = page.locator('.menu-toggle')
    await expect(menuToggle).toBeVisible()

    // Open menu
    await menuToggle.click()
    const sidebar = page.locator('.sidebar')
    await expect(sidebar).toHaveClass(/open/)
  })

  test('sidebar overlay closes mobile menu', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/')
    await expect(page.locator('#main-content')).toBeVisible()

    // Open menu
    await page.locator('.menu-toggle').click()
    await expect(page.locator('.sidebar')).toHaveClass(/open/)

    // Close via overlay (not the toggle, which is covered by sidebar header)
    const overlay = page.locator('.sidebar-overlay')
    if (await overlay.isVisible()) {
      await overlay.click({ force: true })
      await expect(page.locator('.sidebar')).not.toHaveClass(/open/)
    }
  })

  test('clicking nav link navigates and closes mobile menu', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/')
    await expect(page.locator('#main-content')).toBeVisible()

    const menuToggle = page.locator('.menu-toggle')
    await menuToggle.click()

    // Click a nav link (About is safe — no data deps)
    const aboutLink = page.locator('.nav-item >> text=About').first()
    if (await aboutLink.isVisible()) {
      await aboutLink.click()
      await expect(page).toHaveURL(/about/)
      // Menu should close after navigation
      await expect(page.locator('.sidebar')).not.toHaveClass(/open/)
    }
  })

  test('skip to content link exists', async ({ page }) => {
    await page.goto('/')
    // Verify the skip link element exists in the DOM
    const skipLink = page.locator('.skip-to-content')
    await expect(skipLink).toBeAttached()
    await expect(skipLink).toHaveAttribute('href', '#main-content')
  })

  test('active nav item is highlighted', async ({ page }) => {
    await page.goto('/about')
    await expect(page.locator('#main-content')).toBeVisible()
    const aboutNav = page.locator('.nav-item.active').filter({ hasText: /About/i })
    await expect(aboutNav).toBeVisible()
  })
})
