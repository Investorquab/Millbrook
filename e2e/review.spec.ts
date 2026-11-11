import { test, expect } from "@playwright/test";

/**
 * Season-review flow — the fast-forward, scoreboard and Gazette screens, driven
 * by the one live solo season. Navigation is by in-app link clicks (not goto),
 * so the SoloProvider session carries across the screens and the numbers are
 * real: a fresh `page.goto` would reset the season to day 1.
 */
test("fast-forward fills the charts, then the scoreboard and Gazette read the same season", async ({ page }) => {
  test.setTimeout(45_000);

  await page.goto("/play");

  // Give the bakery something to do before we fast-forward.
  const bakery = page.getByRole("region", { name: "Your bakery" });
  await bakery.getByRole("button", { name: /Hire a baker/ }).click();

  // Town → fast-forward.
  await page.getByRole("link", { name: "Fast-forward a week" }).click();
  await expect(page).toHaveURL(/\/fast-forward$/);
  await expect(page.getByRole("heading", { name: "Fast-forwarding a week" })).toBeVisible();

  // The run advances on its own until the progress bar reaches its target.
  const bar = page.getByRole("progressbar", { name: "Fast-forward progress" });
  await expect
    .poll(async () => (await bar.getAttribute("aria-valuenow")) === (await bar.getAttribute("aria-valuemax")), {
      timeout: 10_000,
    })
    .toBe(true);

  // The live charts and the week's events are on the page.
  await expect(page.getByRole("img", { name: /Unemployment by day/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "What happened" })).toBeVisible();

  // Fast-forward → season end.
  await page.getByRole("link", { name: "Skip to season end" }).click();
  await expect(page).toHaveURL(/\/scoreboard$/);
  await expect(page.getByRole("heading", { name: /You finished/ })).toBeVisible();

  const standings = page.getByRole("region", { name: "Final standings" });
  await expect(standings.getByText(/You \(your bakery\)/)).toBeVisible();
  // Reputation is live now: at least one owner ends the season off neutral
  // (a non-zero cell carries the pos/neg class rather than the "—" placeholder).
  await expect(standings.locator(".sb__num.pos, .sb__num.neg").first()).toBeVisible();
  // The closed economy still holds: the town's coins total 10,000.
  await expect(page.getByText("10,000")).toBeVisible();

  // Season end → the final Gazette.
  await page.getByRole("link", { name: "Read the final Gazette" }).click();
  await expect(page).toHaveURL(/\/gazette$/);
  await expect(page.getByRole("heading", { name: "The Millbrook Gazette" })).toBeVisible();
  await expect(page.getByText("Prices this week")).toBeVisible();
});
