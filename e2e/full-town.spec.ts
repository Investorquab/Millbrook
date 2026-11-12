import { test, expect } from "@playwright/test";

/**
 * The full (six-shop) town adds the Tailor (Clothes, from the Weaver's cloth)
 * and the Tavern (Meals, from the Bakery's bread). Chosen on the Hub; the
 * Market then shows all six shops and the town's money still sums to 10,000.
 */
test("the full town opens the Tailor and Tavern, and still sums to 10,000", async ({ page }) => {
  test.setTimeout(45_000);
  await page.goto("/hub");
  await page.getByRole("button", { name: "Full town (six)" }).click();
  await page.getByRole("link", { name: /Start a season/ }).click();
  await expect(page).toHaveURL(/\/play$/);
  await page.getByRole("button", { name: "Skip tour" }).click();

  // Run a few days so the supply chain trades (Weaver → Tailor, Bakery → Tavern).
  await page.getByRole("button", { name: "Play" }).click();
  await page.waitForTimeout(6000);
  await page.getByRole("button", { name: "Pause" }).click();

  await page.getByRole("link", { name: "Market" }).click();
  await expect(page).toHaveURL(/\/market$/);

  const shops = page.getByRole("region", { name: "The workshops" });
  // All six goods are present, including the two new ones.
  for (const good of ["Bread", "Cloth", "Tools", "Ale", "Clothes", "Meals"]) {
    await expect(shops.getByText(good, { exact: true }).first()).toBeVisible();
  }
  // The closed economy still holds.
  await expect(shops.getByText("10,000")).toBeVisible();
});
