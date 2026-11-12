import { test, expect } from "@playwright/test";

/**
 * The seven-shop town adds the Apothecary (Remedies, from herbs bought at the
 * Co-op) on top of the full six. Chosen on the Hub; the Market then shows all
 * seven shops — including Remedies — and the town's money still sums to 10,000.
 */
test("the seven-shop town opens the Apothecary, and still sums to 10,000", async ({ page }) => {
  test.setTimeout(45_000);
  await page.goto("/hub");
  await page.getByRole("button", { name: "Seven (Apothecary)" }).click();
  await page.getByRole("link", { name: /Start a season/ }).click();
  await expect(page).toHaveURL(/\/play$/);
  await page.getByRole("button", { name: "Skip tour" }).click();

  // Run a few days so the Apothecary buys herbs, makes remedies and sells them.
  await page.getByRole("button", { name: "Play" }).click();
  await page.waitForTimeout(6000);
  await page.getByRole("button", { name: "Pause" }).click();

  await page.getByRole("link", { name: "Market" }).click();
  await expect(page).toHaveURL(/\/market$/);

  const shops = page.getByRole("region", { name: "The workshops" });
  // All seven goods are present, including Remedies.
  for (const good of ["Bread", "Cloth", "Tools", "Ale", "Clothes", "Meals", "Remedies"]) {
    await expect(shops.getByText(good, { exact: true }).first()).toBeVisible();
  }
  // The closed economy still holds.
  await expect(shops.getByText("10,000")).toBeVisible();
});
