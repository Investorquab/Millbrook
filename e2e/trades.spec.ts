import { test, expect } from "@playwright/test";

/**
 * The player chooses their trade on the Hub — not always the bakery. When you
 * run the Weaver, the HUD speaks cloth and weavers, never bread and bakers.
 */
test("play as the Weaver — the HUD speaks the trade, not the bakery", async ({ page }) => {
  test.setTimeout(45_000);
  await page.goto("/hub");

  // Pick the Cloth (Weaver) trade, then start the season.
  await page.getByRole("group", { name: "Choose your trade" }).getByRole("button", { name: "Cloth" }).click();
  await page.getByRole("link", { name: /Start a season/ }).click();
  await page.waitForURL(/\/play$/);
  await page.getByRole("button", { name: "Skip tour" }).click();

  // The workshop panel is the weaver, priced in cloth, hiring weavers.
  await expect(page.getByRole("region", { name: "Your weaver" })).toBeVisible();
  await expect(page.getByText("Cloth price")).toBeVisible();
  await expect(page.getByRole("button", { name: /Hire a weaver|Weaver is full/ })).toBeVisible();

  // Nothing says bakery / bread when you're the weaver.
  await expect(page.getByRole("heading", { name: "Your bakery" })).toHaveCount(0);
  await expect(page.getByText("Bread price")).toHaveCount(0);

  // The season runs: press play and the day advances.
  await page.getByRole("button", { name: "Play" }).click();
  await expect(async () => {
    const day = await page.getByText(/Day \d+ of 28/).first().textContent();
    const n = parseInt(day?.match(/Day (\d+)/)?.[1] ?? "1", 10);
    expect(n).toBeGreaterThan(1);
  }).toPass({ timeout: 15000 });
});
