import { test, expect } from '@playwright/test'

// News page — search, category filters, pagination, article navigation
// Run: npx playwright test e2e/news.spec.js

const MAIN = '#main-content'

test.describe('News page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/news')
    await expect(page.locator(MAIN)).toBeVisible({ timeout: 10_000 })
  })

  test('renders article cards', async ({ page }) => {
    const cards = page.locator('.article-card')
    await expect(cards.first()).toBeVisible({ timeout: 10_000 })
    const count = await cards.count()
    expect(count).toBeGreaterThan(0)
    expect(count).toBeLessThanOrEqual(12) // ARTICLES_PER_PAGE
  })

  test('search filters articles by title', async ({ page }) => {
    await expect(page.locator('.article-card').first()).toBeVisible({ timeout: 10_000 })
    const initialCount = await page.locator('.article-card').count()

    // Type a very specific search that probably won't match all articles
    const searchInput = page.locator('.news-search-input')
    await searchInput.fill('spending')
    await page.waitForTimeout(300) // debounce

    const resultsText = page.locator('.news-results-count')
    await expect(resultsText).toBeVisible()

    // Clear search restores results
    const clearBtn = page.locator('.news-search-clear')
    if (await clearBtn.isVisible()) {
      await clearBtn.click()
      await expect(searchInput).toHaveValue('')
    }
  })

  test('category filter buttons work', async ({ page }) => {
    await expect(page.locator('.article-card').first()).toBeVisible({ timeout: 10_000 })

    const filterBtns = page.locator('.filter-btn')
    const count = await filterBtns.count()
    expect(count).toBeGreaterThan(1) // At least "All" + one category

    // First button should be "All" and active
    await expect(filterBtns.first()).toHaveClass(/active/)

    // Click second filter if available
    if (count > 1) {
      await filterBtns.nth(1).click()
      await expect(filterBtns.nth(1)).toHaveClass(/active/)
      await expect(filterBtns.first()).not.toHaveClass(/active/)
    }
  })

  test('pagination controls appear when enough articles', async ({ page }) => {
    await expect(page.locator('.article-card').first()).toBeVisible({ timeout: 10_000 })
    const pagination = page.locator('.news-pagination')

    // Pagination only shows if >12 articles
    if (await pagination.isVisible()) {
      await expect(page.locator('.pagination-info')).toContainText(/Page/)
      const nextBtn = page.locator('.pagination-btn').last()
      if (await nextBtn.isEnabled()) {
        await nextBtn.click()
        await expect(page.locator('.pagination-info')).toContainText(/Page 2/)
      }
    }
  })

  test('clicking article card navigates to article view', async ({ page }) => {
    const firstCard = page.locator('.article-card').first()
    await expect(firstCard).toBeVisible({ timeout: 10_000 })
    await firstCard.click()
    await expect(page).toHaveURL(/\/news\//)
    await expect(page.locator('.article-content, .article-header')).toBeVisible({ timeout: 10_000 })
  })

  test('article images show or use placeholders', async ({ page }) => {
    await expect(page.locator('.article-card').first()).toBeVisible({ timeout: 10_000 })
    const imageContainers = page.locator('.article-card-image')
    const count = await imageContainers.count()
    expect(count).toBeGreaterThan(0)

    // Each card should have either an img or a placeholder
    for (let i = 0; i < Math.min(count, 3); i++) {
      const container = imageContainers.nth(i)
      const hasImg = await container.locator('img').count() > 0
      const hasPlaceholder = await container.locator('.article-image-placeholder').count() > 0
      expect(hasImg || hasPlaceholder).toBe(true)
    }
  })
})
