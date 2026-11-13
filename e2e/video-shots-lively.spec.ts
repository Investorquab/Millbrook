import { test } from "@playwright/test";

/**
 * Livelier video stills — plays a solo season, then navigates by in-app links
 * (which preserve the shared session, unlike page.goto) to capture populated
 * Market / Scoreboard / Gazette / Resident / Proof frames. Overwrites the static
 * versions in private/video/shots/.
 * Run: npx playwright test e2e/video-shots-lively.spec.ts --project=desktop
 */
const OUT = "private/video/shots";

test("lively played-season stills", async ({ page }) => {
  test.setTimeout(180_000);

  await page.goto("/play");
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(1500);

  // Dismiss the first-run tutorial so it doesn't cover the scene.
  try {
    const skip = page.getByText("Skip tour", { exact: true });
    if (await skip.isVisible()) await skip.click();
  } catch {
    /* no tour */
  }

  // Start the season and let it run deep (sales, coin-flow, a Game Master event).
  await page.getByRole("button", { name: "Play" }).first().click();
  await page.waitForTimeout(22_000); // ~day 18 at 1200ms/day

  // The lively town (coins flowing, a GM card likely showing).
  await page.screenshot({ path: `${OUT}/04b-town-live.png`, fullPage: false });

  // Let it keep running toward the season's end while we tour the screens
  // (the clock advances at the provider level, so it keeps ticking).
  const go = async (href: string, name: string, settle = 2200) => {
    await page.locator(`a[href="${href}"]`).first().click();
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(settle);
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
  };

  // Market (populated: real prices, sales, profit, standing).
  await go("/market", "05-market");
  // Scoreboard (ranked owners, reputation, trophies) — reached from Market.
  await go("/scoreboard", "08-scoreboard");
  // Gazette (the week written from real events) — reached from Scoreboard.
  await go("/gazette", "09-gazette");

  // Back to town, then Proof — coins have moved, so Follow-a-coin is populated.
  await page.locator('a[href="/play"]').first().click();
  await page.waitForTimeout(1500);
  await go("/proof", "06-proof-onchain", 3500);

  // Back to town, then a Resident with real history.
  await page.locator('a[href="/play"]').first().click();
  await page.waitForTimeout(1500);
  await go("/resident", "10-resident", 2000);
});
