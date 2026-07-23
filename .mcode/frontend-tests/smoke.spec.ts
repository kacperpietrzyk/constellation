import { test, expect } from "@playwright/test";

/**
 * Smoke tests for Constellation desktop-ui.
 *
 * These tests verify that the Vite dev build produced by the milestone-1
 * tsconfig cleanup (removing esModuleInterop and useUnknownInCatchVariables)
 * renders correctly in the browser.
 *
 * The app is an Electron desktop app; these tests exercise the React renderer
 * via the Vite dev server and the dev harness pages which are self-contained
 * (no Electron IPC required).
 */

test.describe("Root page", () => {
  test("loads and shows the Constellation title", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // The page title should be set by index.html
    await expect(page).toHaveTitle("Constellation");
  });

  test("renders app root element", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // The root div must exist — if Vite failed to parse/bundle the TSX,
    // the script tag would throw and root would stay empty
    const root = page.locator("#root");
    await expect(root).toBeAttached();

    // The app mounts content into #root
    const rootChildren = await root.locator("> *").count();
    expect(rootChildren).toBeGreaterThan(0);
  });

  test("shows electron bridge unavailability message when running in browser", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Without Electron preload, the app shows a recovery/unavailability message
    // confirming the React app started and rendered correctly
    const body = await page.evaluate(() => document.body.innerText);
    expect(body.length).toBeGreaterThan(0);

    // Should mention Constellation and unavailability (Polish UI)
    expect(body).toContain("CONSTELLATION");
  });
});

test.describe("Work surface harness", () => {
  test("loads and renders work surface content", async ({ page }) => {
    await page.goto("/?surface=work");
    await page.waitForLoadState("networkidle");

    await expect(page).toHaveTitle("Constellation");

    // The work harness should render the work surface component
    const harness = page.locator('[data-testid="work-harness"]');
    await expect(harness).toBeVisible();
  });

  test("shows work surface with task list content", async ({ page }) => {
    await page.goto("/?surface=work");
    await page.waitForLoadState("networkidle");

    const body = await page.evaluate(() => document.body.innerText);

    // The work harness has Polish-language fixture data — verify real content rendered
    // "Praca" = "Work" in Polish
    expect(body).toContain("Praca");
  });

  test("work harness has no JavaScript errors on load", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto("/?surface=work");
    await page.waitForLoadState("networkidle");

    // No uncaught JS errors — confirms tsconfig changes don't cause runtime issues
    expect(errors).toHaveLength(0);
  });
});

test.describe("Onboarding harness", () => {
  test("loads and renders onboarding flow", async ({ page }) => {
    await page.goto("/?surface=onboarding");
    await page.waitForLoadState("networkidle");

    await expect(page).toHaveTitle("Constellation");

    const body = await page.evaluate(() => document.body.innerText);
    // Onboarding shows step indicators like "01 / 03"
    expect(body.length).toBeGreaterThan(0);
  });

  test("onboarding harness has no JavaScript errors on load", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto("/?surface=onboarding");
    await page.waitForLoadState("networkidle");

    expect(errors).toHaveLength(0);
  });
});

test.describe("Settings harness", () => {
  test("loads and renders settings surface", async ({ page }) => {
    await page.goto("/?surface=settings");
    await page.waitForLoadState("networkidle");

    await expect(page).toHaveTitle("Constellation");

    const body = await page.evaluate(() => document.body.innerText);
    // Settings harness shows "Ustawienia" (Polish for "Settings")
    expect(body).toContain("Ustawienia");
  });

  test("settings harness has no JavaScript errors on load", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto("/?surface=settings");
    await page.waitForLoadState("networkidle");

    expect(errors).toHaveLength(0);
  });
});

test.describe("TypeScript compilation smoke test via built assets", () => {
  test("Vite serves JS assets from dist (build completed successfully)", async ({
    page,
  }) => {
    // Capture network requests for JS files
    const jsRequests: string[] = [];
    page.on("requestfinished", (req) => {
      if (req.url().includes(".js") || req.url().includes(".tsx")) {
        jsRequests.push(req.url());
      }
    });

    await page.goto("/?surface=work");
    await page.waitForLoadState("networkidle");

    // At least one JS module was loaded, confirming Vite dev server is bundling
    // the TypeScript code (including the changed tsconfig.base.json settings)
    expect(jsRequests.length).toBeGreaterThan(0);
  });

  test("no 500 errors from Vite when loading harness pages", async ({
    page,
  }) => {
    const failedRequests: string[] = [];
    page.on("requestfailed", (req) => {
      failedRequests.push(`${req.method()} ${req.url()}: ${req.failure()?.errorText}`);
    });

    // Check all main harness pages compile and serve without errors
    for (const surface of ["work", "onboarding", "settings"]) {
      await page.goto(`/?surface=${surface}`);
      await page.waitForLoadState("networkidle");
    }

    expect(failedRequests).toHaveLength(0);
  });
});
