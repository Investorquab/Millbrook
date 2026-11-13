import { test, expect } from "@playwright/test";

/**
 * The goal chosen on the Hub is scored on the Scoreboard — the shared solo
 * session carries it across in-app navigation (clicks, not reloads).
 */
test("the goal chosen on the Hub is the one the Scoreboard uses", async ({ page }) => {
  await page.goto("/hub");
  await page.getByRole("button", { name: "Steadfast" }).click();
  await page.getByRole("link", { name: /Start a season/ }).click();
  await expect(page).toHaveURL(/\/play$/);
  await page.getByRole("button", { name: "Skip tour" }).click();

  // Reach the Scoreboard by in-app links (Market → Scoreboard), no reload.
  await page.getByRole("link", { name: "Market" }).click();
  await page.getByRole("link", { name: "Scoreboard" }).click();
  await expect(page).toHaveURL(/\/scoreboard$/);
  await expect(page.getByText(/Goal card: Steadfast/)).toBeVisible();
});

/** A co-op card (Town Hero) scores the whole town, not the owners, and the
 *  Scoreboard shows a met/missed banner instead of a personal ranking. */
test("a co-op goal card shows the town-wide outcome on the Scoreboard", async ({ page }) => {
  await page.goto("/hub");
  await page.getByRole("button", { name: "Town Hero" }).click();
  await page.getByRole("link", { name: /Start a season/ }).click();
  await expect(page).toHaveURL(/\/play$/);
  await page.getByRole("button", { name: "Skip tour" }).click();

  await page.getByRole("link", { name: "Market" }).click();
  await page.getByRole("link", { name: "Scoreboard" }).click();
  await expect(page).toHaveURL(/\/scoreboard$/);
  await expect(page.getByText(/Goal card: Town Hero/)).toBeVisible();
  await expect(page.getByText(/Goal achieved|Goal missed/)).toBeVisible();
});
