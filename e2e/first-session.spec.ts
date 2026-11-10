import { test, expect } from "@playwright/test";

/**
 * M2 acceptance — "a new player signs in, hires a worker, sets a price and sees
 * a sale within 60 seconds." Drives the whole flow against the live solo
 * season: sign-in → hub → town, then hire, set a price, press play and wait for
 * the bakery to make a sale.
 */
test("a new player signs in, hires, sets a price and sees a sale", async ({ page }) => {
  test.setTimeout(60_000);

  // Sign in with an email and a username.
  await page.goto("/signin");
  await page.getByLabel("Email").fill("player@example.com");
  await page.getByLabel("Username").fill("millhand");
  await page.getByRole("button", { name: "Send login link" }).click();

  // Land on the hub and start a solo season.
  await expect(page).toHaveURL(/\/hub$/);
  await page.getByRole("link", { name: /Start a season/ }).click();
  await expect(page).toHaveURL(/\/play$/);

  const bakery = page.getByRole("region", { name: "Your bakery" });

  // Hire a baker and set a low, affordable price.
  await bakery.getByRole("button", { name: /Hire a baker/ }).click();
  const lower = bakery.getByRole("button", { name: "Lower the bread price" });
  await lower.click(); // 3 → 2 coins, cheap enough that residents buy

  // Run the town and wait for a sale (the "Sold today" figure goes above zero).
  await page.getByRole("button", { name: "Play" }).click();
  const soldToday = bakery.locator(".town__stats span", { hasText: "Sold today" }).locator("b");
  await expect(soldToday).not.toHaveText("0 loaves", { timeout: 30_000 });
});
