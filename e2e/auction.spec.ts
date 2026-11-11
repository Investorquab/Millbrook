import { test, expect } from "@playwright/test";

/**
 * Bankruptcy auctions, player side. Around mid-season an AI owner retires and
 * their shop goes up for auction; the HUD offers the player the premises. Here
 * we play until the offer appears and take it over, then check the offer clears.
 * Driven by the live solo season (seed 42), where the beat fires around day 15.
 */
test("the player can take over a shop at auction", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/play");
  await page.getByRole("button", { name: "Skip tour" }).click();

  // Run the season; the auction offer appears around day 15.
  await page.getByRole("button", { name: "Play" }).click();

  const auction = page.getByRole("region", { name: "Auction" });
  await expect(auction).toBeVisible({ timeout: 30_000 });

  // Pause the clock the moment the offer appears, so the bid window can't lapse
  // (an AI buyer takes it after a few days) while we interact.
  await page.getByRole("button", { name: "Pause" }).click();

  // Bid for the premises; the offer then clears (the player runs it now).
  await auction.getByRole("button", { name: /Take it over/ }).click();
  await expect(auction).toBeHidden();

  // The town's money still sums to exactly 10,000 after the purchase.
  await page.getByRole("link", { name: "Proof" }).first().click();
  await expect(page).toHaveURL(/\/proof$/);
  await expect(page.getByRole("region", { name: "The town's money" }).getByText("10,000")).toBeVisible();
});
