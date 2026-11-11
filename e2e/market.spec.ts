import { test, expect } from "@playwright/test";

/**
 * The Market screen surfaces the whole living economy: all four workshops (the
 * player's bakery plus the three AI rivals), the public purse summing to 10,000,
 * and the live transaction ledger. Driven by the same solo season, reached by an
 * in-app click (navigating by URL would reset the season).
 */
test("the market shows all four shops and the town's money sums to 10,000", async ({ page }) => {
  await page.goto("/signin");
  await page.getByLabel("Email").fill("player@example.com");
  await page.getByLabel("Username").fill("millhand");
  await page.getByRole("button", { name: "Send login link" }).click();
  await page.getByRole("link", { name: /Start a season/ }).click();
  await page.waitForURL(/\/play$/);
  await page.getByRole("button", { name: "Skip tour" }).click();

  // Run a few days so the shops trade and the ledger fills.
  await page.getByRole("button", { name: "Play" }).click();
  await page.waitForTimeout(6000);
  await page.getByRole("button", { name: "Pause" }).click();

  await page.getByRole("link", { name: "Market" }).click();
  await expect(page).toHaveURL(/\/market$/);

  // All four goods / shops are present.
  const shops = page.getByRole("region", { name: "The workshops" });
  for (const good of ["Bread", "Cloth", "Tools", "Ale"]) {
    await expect(shops.getByText(good, { exact: true }).first()).toBeVisible();
  }
  // The player's bakery is marked, and the three AI rivals are named.
  await expect(shops.getByText("You", { exact: true })).toBeVisible();
  await expect(shops.getByText("Greedy Gus")).toBeVisible();

  // The public purse shows the fixed town total.
  await expect(shops.getByText("10,000")).toBeVisible();

  // The ledger lists transactions from across the town.
  const ledger = page.getByRole("complementary", { name: "Transactions across the town" });
  await expect(ledger.locator(".market__ledger-item").first()).toBeVisible();
});
