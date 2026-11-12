import { test, expect } from "@playwright/test";

/**
 * The eight-shop town opens the Carpenter (House parts). Chosen on the Hub; the
 * Market then shows all eight goods including House parts, and the town's money
 * still sums to 10,000.
 */
test("the eight-shop town opens the Carpenter, and still sums to 10,000", async ({ page }) => {
  test.setTimeout(45_000);
  await page.goto("/hub");
  await page.getByRole("button", { name: "Eight (Carpenter)" }).click();
  await page.getByRole("link", { name: /Start a season/ }).click();
  await expect(page).toHaveURL(/\/play$/);
  await page.getByRole("button", { name: "Skip tour" }).click();

  // Run a few days so the carpenter makes parts and the Town Hall buys them.
  await page.getByRole("button", { name: "Play" }).click();
  await page.waitForTimeout(6000);
  await page.getByRole("button", { name: "Pause" }).click();

  await page.getByRole("link", { name: "Market" }).click();
  await expect(page).toHaveURL(/\/market$/);

  const shops = page.getByRole("region", { name: "The workshops" });
  for (const good of ["Bread", "Cloth", "Tools", "Ale", "Clothes", "Meals", "Remedies", "House parts"]) {
    await expect(shops.getByText(good, { exact: true }).first()).toBeVisible();
  }
  await expect(shops.getByText("10,000")).toBeVisible();
});
