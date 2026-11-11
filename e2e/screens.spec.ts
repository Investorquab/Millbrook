import { test, expect } from "@playwright/test";

/**
 * Resident and Proof read the SAME live season as the town, via the shared
 * SoloProvider — but only across in-app navigation (react-router links), not a
 * full reload. These tests play a few days, then follow links to each screen
 * and check the data reflects the season that was actually played.
 */
test("the resident card and Proof follow the same live season", async ({ page }, testInfo) => {
  test.setTimeout(45_000);
  // The floating resident bubble is a desktop-only overlay (hidden on phone),
  // so this link-driven flow runs on the desktop project.
  test.skip(testInfo.project.name === "phone", "resident bubble is hidden on phone");

  await page.goto("/play");
  const bakery = page.getByRole("region", { name: "Your bakery" });
  await bakery.getByRole("button", { name: /Hire a baker/ }).click();

  // Run until the clock has advanced a few days.
  await page.getByRole("button", { name: "Play" }).click();
  await expect(page.getByText(/Day [4-9] of 28|Day 1[0-9] of 28/)).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Pause" }).click();

  // Follow the resident bubble (an in-app link) to the resident card.
  await page.getByRole("link", { name: /Tap a resident/ }).click();
  await expect(page).toHaveURL(/\/resident$/);
  await expect(page.getByText(/at your bakery/)).toBeVisible();
  // A played season leaves a real reason on the card.
  await expect(page.getByText(/Why .* chose as they did/)).toBeVisible();

  // Follow a coin → Proof, where the split still totals 10,000.
  await page.getByRole("link", { name: /Follow one of/ }).click();
  await expect(page).toHaveURL(/\/proof$/);
  const money = page.getByRole("region", { name: "The town's money" });
  await expect(money.getByText("10,000")).toBeVisible();
  await expect(money.getByText("Residents")).toBeVisible();
  await expect(money.getByText("Workshops")).toBeVisible();

  // Follow a coin: a played season leaves real moves, so the trail renders with
  // at least one hop, and "Trace another coin" swaps to a different path.
  const coin = page.getByRole("region", { name: "Follow a coin" });
  await expect(coin.locator(".proof__trail-hop").first()).toBeVisible();
  const firstMove = () => coin.locator(".proof__trail-move").first().innerText();
  const seen = new Set<string>([await firstMove()]);
  // "Trace another coin" swaps to a different path; a few clicks find a distinct one.
  for (let i = 0; i < 5 && seen.size < 2; i++) {
    await coin.getByRole("button", { name: "Trace another coin" }).click();
    seen.add(await firstMove());
  }
  expect(seen.size).toBeGreaterThan(1);
});
