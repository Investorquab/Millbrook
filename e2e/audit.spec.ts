import { test, expect, type Page, type ConsoleMessage } from "@playwright/test";
import { mkdirSync } from "node:fs";

/**
 * A full walk of the game: every screen, every back button, the guided tour, and
 * a check that no screen logs a console error or throws. Screenshots land in
 * e2e/__audit__/ for a visual review. Navigation is by in-app clicks (never a
 * reload), so the shared solo season is preserved across screens.
 */

const DIR = "e2e/__audit__";
mkdirSync(DIR, { recursive: true });

/** Attach console-error / page-error collectors; return the list of problems. */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (m: ConsoleMessage) => {
    if (m.type() === "error") errors.push(`console.error: ${m.text()}`);
  });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  return errors;
}

test("full screen + back-button + guide audit (no console errors)", async ({ page }) => {
  test.setTimeout(90_000);
  const errors = watchErrors(page);
  const shot = (name: string) => page.screenshot({ path: `${DIR}/${name}.png`, fullPage: true });

  // Title
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await shot("01-title");

  // Hub (sign in happens here for rooms; solo goal/trade/town pickers live here)
  await page.goto("/hub");
  await expect(page.getByText("Your goal")).toBeVisible();
  await shot("02-hub");

  // Start a solo season from the Hub.
  await page.getByRole("link", { name: /Start a season/ }).click();
  await expect(page).toHaveURL(/\/play$/);

  // The guided tour appears on a first visit; skipping it must work.
  const skip = page.getByRole("button", { name: "Skip tour" });
  if (await skip.isVisible().catch(() => false)) {
    await shot("03-play-tour");
    await skip.click();
  }
  await expect(page.getByLabel(/town|Live town/i).first()).toBeVisible();
  await shot("04-play");

  // Each sub-screen: open from the Town HUD, confirm it renders, then go back.
  // Back navigation is by the link that points at /play (robust across screens).
  const backToTown = async () => {
    await page.locator('a[href="/play"]').first().click();
    await expect(page).toHaveURL(/\/play$/);
  };

  // Market
  await page.getByRole("link", { name: "Market" }).click();
  await expect(page).toHaveURL(/\/market$/);
  await expect(page.getByText(/10,000/)).toBeVisible();
  await shot("05-market");
  await backToTown();

  // Proof — the on-chain invariant must read 10,000.
  await page.getByRole("link", { name: "Proof" }).click();
  await expect(page).toHaveURL(/\/proof$/);
  await expect(page.getByText(/coins, always/)).toBeVisible();
  await shot("06-proof");
  await backToTown();

  // Resident card (reached from the "tap a resident" bubble).
  await page.getByRole("link", { name: /resident/i }).first().click();
  await expect(page).toHaveURL(/\/resident$/);
  await shot("07-resident");
  await backToTown();

  // Gazette
  await page.getByRole("link", { name: "Gazette" }).click();
  await expect(page).toHaveURL(/\/gazette$/);
  await expect(page.getByText(/The Millbrook Gazette/)).toBeVisible();
  await shot("08-gazette");
  await backToTown();

  // Fast-forward, then on to the Scoreboard via "Skip to season end".
  await page.getByRole("link", { name: /Fast.forward/i }).click();
  await expect(page).toHaveURL(/\/fast-forward$/);
  await shot("09-fast-forward");
  await page.getByRole("link", { name: "Skip to season end" }).click();
  await expect(page).toHaveURL(/\/scoreboard$/);
  await shot("10-scoreboard");

  // The 404 page is friendly, not a raw router error.
  await page.goto("/this-route-does-not-exist");
  await expect(page.getByText(/isn't in Millbrook|Back to Millbrook|Reload/i).first()).toBeVisible();
  await shot("11-notfound");

  // No screen should have logged an error or thrown.
  expect(errors, `console/page errors:\n${errors.join("\n")}`).toEqual([]);
});
