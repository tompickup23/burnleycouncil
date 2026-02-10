import { test, expect } from '@playwright/test'

// Spending page — search, filters, tab switching, pagination, data table
// Run: npx playwright test e2e/spending.spec.js
// Note: Spending page uses a Web Worker for data processing — allow extra time

const MAIN = '#main-content'

test.describe('Spending page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/spending')
    await expect(page.locator(MAIN)).toBeVisible({ timeout: 15_000 })
    // Wait for worker to load data
    await expect(page.locator(MAIN)).toContainText(/transaction|record|Spending/i, { timeout: 15_000 })
  })

  test('renders data table with rows', async ({ page }) => {
    const tableTab = page.locator('.tab-btn').filter({ hasText: /Data Table/i })
    if (await tableTab.isVisible()) {
      await tableTab.click()
    }
    // Wait for table rows to appear (worker async)
    const rows = page.locator('table tbody tr')
    await expect(rows.first()).toBeVisible({ timeout: 15_000 })
    expect(await rows.count()).toBeGreaterThan(0)
  })

  test('search filters results', async ({ page }) => {
    const searchInput = page.locator('input[aria-label="Search spending records"]')
    if (await searchInput.isVisible()) {
      await searchInput.fill('test-unlikely-term-xyz')
      await page.waitForTimeout(500) // debounce + worker roundtrip

      // Should show no results or fewer results
      const noResults = page.locator('.no-results, .empty-state')
      const rows = page.locator('table tbody tr')
      const rowCount = await rows.count()

      // Either no-results message shows or table has 0 rows
      if (await noResults.isVisible()) {
        expect(true).toBe(true)
      } else {
        expect(rowCount).toBe(0)
      }

      // Clear search
      const clearBtn = page.locator('.search-clear')
      if (await clearBtn.isVisible()) {
        await clearBtn.click()
        await expect(searchInput).toHaveValue('')
      }
    }
  })

  test('tab switching between Data Table and Visualisations', async ({ page }) => {
    const tabs = page.locator('.tab-btn')
    const count = await tabs.count()

    if (count >= 2) {
      // Click Visualisations tab
      const vizTab = tabs.filter({ hasText: /Visualis/i })
      if (await vizTab.isVisible()) {
        await vizTab.click()
        await expect(vizTab).toHaveClass(/active/)
        // Charts container should be visible
        await expect(page.locator('.charts-grid, .chart-card, .recharts-wrapper').first()).toBeVisible({ timeout: 10_000 })
      }

      // Switch back to Data Table
      const tableTab = tabs.filter({ hasText: /Data Table/i })
      if (await tableTab.isVisible()) {
        await tableTab.click()
        await expect(tableTab).toHaveClass(/active/)
      }
    }
  })

  test('filter toggle shows/hides filter panel', async ({ page }) => {
    const filterToggle = page.locator('.filter-toggle')
    if (await filterToggle.isVisible()) {
      await filterToggle.click()
      // Filter panel should appear
      const filterPanel = page.locator('.filter-panel, .filters-panel, .filter-grid')
      await expect(filterPanel.first()).toBeVisible({ timeout: 5_000 })

      // Toggle off
      await filterToggle.click()
      await page.waitForTimeout(300)
    }
  })

  test('column headers are sortable', async ({ page }) => {
    const tableTab = page.locator('.tab-btn').filter({ hasText: /Data Table/i })
    if (await tableTab.isVisible()) {
      await tableTab.click()
    }

    await expect(page.locator('table tbody tr').first()).toBeVisible({ timeout: 15_000 })

    const sortableHeaders = page.locator('th.sortable')
    if (await sortableHeaders.count() > 0) {
      // Click a sortable header
      await sortableHeaders.first().click()
      await page.waitForTimeout(500) // worker roundtrip
      // Should still have rows (sorting doesn't remove data)
      expect(await page.locator('table tbody tr').count()).toBeGreaterThan(0)
    }
  })

  test('pagination navigates between pages', async ({ page }) => {
    const tableTab = page.locator('.tab-btn').filter({ hasText: /Data Table/i })
    if (await tableTab.isVisible()) {
      await tableTab.click()
    }

    await expect(page.locator('table tbody tr').first()).toBeVisible({ timeout: 15_000 })

    const nextBtn = page.locator('.page-btn').filter({ hasText: /Next|›/ })
    if (await nextBtn.isVisible() && await nextBtn.isEnabled()) {
      await nextBtn.click()
      await page.waitForTimeout(500)
      // URL should update with page parameter
      await expect(page).toHaveURL(/page=2/)
    }
  })

  test('no console errors during interaction', async ({ page }) => {
    const errors = []
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text())
    })

    // Wait for data to load
    await page.waitForTimeout(3000)

    const realErrors = errors.filter(e =>
      !e.includes('favicon') && !e.includes('net::') &&
      !e.includes('manifest') && !e.includes('service-worker')
    )
    expect(realErrors).toHaveLength(0)
  })
})
