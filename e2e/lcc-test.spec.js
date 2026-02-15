// @ts-check
import { test, expect } from "@playwright/test";

const BASE = "http://localhost:5174";

// Increase timeout for all tests — LCC data files are large
test.setTimeout(60000);

test.describe("Lancashire County Council (LCC) Site Tests", () => {
  test("Homepage loads with correct title and council name", async ({ page }) => {
    await page.goto(BASE + "/");
    await expect(page).toHaveTitle(/Lancashire.*Council.*Transparency/i);

    // Check council name appears
    const content = await page.textContent("body");
    expect(content).toContain("Lancashire");
  });

  test("Navigation does NOT show Spending link", async ({ page }) => {
    await page.goto(BASE + "/");
    // Wait for React to render nav — don't use networkidle (worker keeps connecting)
    await page.waitForSelector("nav", { timeout: 10000 });
    await page.waitForTimeout(1000);

    const navText = await page.textContent("nav");
    // Spending should be hidden (spending: false in config)
    expect(navText).not.toMatch(/\bSpending\b/);

    // These should be present
    expect(navText).toMatch(/DOGE|Investigation/);
    expect(navText).toMatch(/Budget/);
  });

  test("DOGE Investigation page loads with findings", async ({ page }) => {
    await page.goto(BASE + "/doge");
    // Wait for loading state to appear, then for data to load
    try {
      await page.waitForSelector("text=Loading investigation data", { timeout: 5000 });
    } catch { /* may have loaded instantly */ }
    await page.waitForFunction(
      () => !document.body.textContent.includes("Loading investigation data"),
      { timeout: 30000 }
    );
    await page.waitForTimeout(1000);

    const content = await page.textContent("body");
    // Should show fraud triangle score or finding content
    expect(content).toMatch(/77|fraud|triangle|duplicate|split|benford/i);
  });

  test("Budgets page loads with GOV.UK data", async ({ page }) => {
    await page.goto(BASE + "/budgets");
    await page.waitForFunction(
      () => !document.body.textContent.includes("Loading"),
      { timeout: 15000 }
    );
    await page.waitForTimeout(1000);

    const content = await page.textContent("body");
    // Should show budget data (GOV.UK fallback path since budgets: false)
    expect(content).toMatch(/education|social care|budget|expenditure|revenue/i);
  });

  test("Demographics page loads with ward data", async ({ page }) => {
    await page.goto(BASE + "/demographics");
    await page.waitForFunction(
      () => !document.body.textContent.includes("Loading"),
      { timeout: 15000 }
    );
    await page.waitForTimeout(1000);

    const content = await page.textContent("body");
    expect(content).toMatch(/population|ethnicity|ward|age/i);
  });

  test("Procurement page loads with contracts", async ({ page }) => {
    await page.goto(BASE + "/procurement");
    await page.waitForFunction(
      () => !document.body.textContent.includes("Loading"),
      { timeout: 15000 }
    );
    await page.waitForTimeout(1000);

    const content = await page.textContent("body");
    expect(content).toMatch(/contract|procurement|tender/i);
  });

  test("Compare page loads with cross-council data", async ({ page }) => {
    await page.goto(BASE + "/compare");
    await page.waitForFunction(
      () => !document.body.textContent.includes("Loading"),
      { timeout: 15000 }
    );
    await page.waitForTimeout(1000);

    const content = await page.textContent("body");
    expect(content).toMatch(/burnley|hyndburn|compare|council/i);
  });

  test("FOI page loads", async ({ page }) => {
    await page.goto(BASE + "/foi");
    await page.waitForTimeout(2000);

    const content = await page.textContent("body");
    expect(content).toMatch(/freedom.*information|FOI|request/i);
  });

  test("About page loads", async ({ page }) => {
    await page.goto(BASE + "/about");
    await page.waitForTimeout(2000);

    const content = await page.textContent("body");
    expect(content).toMatch(/about|transparency|independent/i);
  });

  test("Legal page loads", async ({ page }) => {
    await page.goto(BASE + "/legal");
    await page.waitForTimeout(2000);

    const content = await page.textContent("body");
    expect(content).toMatch(/legal|privacy|data|disclaimer/i);
  });

  test("Spending page shows no data when spending disabled", async ({ page }) => {
    await page.goto(BASE + "/spending");
    await page.waitForTimeout(5000);

    // Since spending is disabled in config (no spending.json deployed),
    // the worker will fail to load data. The page renders but has no rows.
    // Check there are no actual data table rows (tbody tr with amounts)
    const rows = await page.$$("tbody tr");
    // Either no table rows, or page shows error/loading
    const content = await page.textContent("body");
    const hasNoRows = rows.length === 0;
    const showsError = content.includes("Error") || content.includes("Loading") || content.includes("Unable");
    expect(hasNoRows || showsError).toBeTruthy();
  });

  test("Config.json shows county tier with correct flags", async ({ page }) => {
    const response = await page.goto(BASE + "/data/config.json");
    const config = await response.json();

    expect(config.council_tier).toBe("county");
    expect(config.council_name).toContain("Lancashire");
    expect(config.data_sources.spending).toBe(false);
    expect(config.data_sources.budgets).toBe(false);
    expect(config.data_sources.doge_investigation).toBe(true);
    expect(config.data_sources.procurement).toBe(true);
    expect(config.data_sources.demographics).toBe(true);
  });

  test("No console errors on homepage", async ({ page }) => {
    const errors = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });

    await page.goto(BASE + "/");
    await page.waitForSelector("nav", { timeout: 10000 });
    await page.waitForTimeout(2000);

    const realErrors = errors.filter(
      (e) => !e.includes("favicon") && !e.includes("service-worker") && !e.includes("sw.js")
    );
    expect(realErrors).toHaveLength(0);
  });

  test("No console errors on DOGE page", async ({ page }) => {
    const errors = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });

    await page.goto(BASE + "/doge");
    await page.waitForFunction(
      () => !document.body.textContent.includes("Loading investigation data"),
      { timeout: 15000 }
    );
    await page.waitForTimeout(2000);

    const realErrors = errors.filter(
      (e) => !e.includes("favicon") && !e.includes("service-worker") && !e.includes("sw.js")
    );
    expect(realErrors).toHaveLength(0);
  });

  test("No console errors on Budgets page", async ({ page }) => {
    const errors = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });

    await page.goto(BASE + "/budgets");
    await page.waitForFunction(
      () => !document.body.textContent.includes("Loading"),
      { timeout: 15000 }
    );
    await page.waitForTimeout(2000);

    const realErrors = errors.filter(
      (e) => !e.includes("favicon") && !e.includes("service-worker") && !e.includes("sw.js")
    );
    expect(realErrors).toHaveLength(0);
  });

  test("No console errors on Demographics page", async ({ page }) => {
    const errors = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });

    await page.goto(BASE + "/demographics");
    await page.waitForFunction(
      () => !document.body.textContent.includes("Loading"),
      { timeout: 15000 }
    );
    await page.waitForTimeout(2000);

    const realErrors = errors.filter(
      (e) => !e.includes("favicon") && !e.includes("service-worker") && !e.includes("sw.js")
    );
    expect(realErrors).toHaveLength(0);
  });

  test("No console errors on Procurement page", async ({ page }) => {
    const errors = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });

    await page.goto(BASE + "/procurement");
    await page.waitForFunction(
      () => !document.body.textContent.includes("Loading"),
      { timeout: 15000 }
    );
    await page.waitForTimeout(2000);

    const realErrors = errors.filter(
      (e) => !e.includes("favicon") && !e.includes("service-worker") && !e.includes("sw.js")
    );
    expect(realErrors).toHaveLength(0);
  });

  test("No console errors on Compare page", async ({ page }) => {
    const errors = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });

    await page.goto(BASE + "/compare");
    await page.waitForFunction(
      () => !document.body.textContent.includes("Loading"),
      { timeout: 15000 }
    );
    await page.waitForTimeout(2000);

    const realErrors = errors.filter(
      (e) => !e.includes("favicon") && !e.includes("service-worker") && !e.includes("sw.js")
    );
    expect(realErrors).toHaveLength(0);
  });
});
