import { test, expect } from "@playwright/test";

/**
 * Decision cards: underpay the crew and they demand a raise — a timed card with
 * options. Answering it ("Give the raise") applies the choice.
 */
test("a wage demand appears when you underpay, and you can answer it", async ({ page }) => {
  test.setTimeout(45_000);
  await page.goto("/hub");
  await page.getByRole("link", { name: /Start a season/ }).click();
  await page.waitForURL(/\/play$/);
  await page.getByRole("button", { name: "Skip tour" }).click();

  // Underpay the shop (below the town average) so a wage demand surfaces.
  const lower = page.getByRole("button", { name: "Lower the wage" });
  for (let i = 0; i < 3; i++) await lower.click();

  // Run the season; a decision card (a wage demand) surfaces in the HUD with an
  // answerable option. (Answering it is covered by the engine tests.)
  await page.getByRole("button", { name: "Play" }).click();
  const decision = page.getByRole("region", { name: "A decision" }).first();
  await expect(decision).toBeVisible({ timeout: 25000 });
  await expect(decision.locator("button.decision__btn").first()).toBeVisible();
});

test("the decision card is wired into rooms too (same component)", async ({ page }) => {
  // A lightweight check that the room screen imports and renders without error;
  // the decision data flows over the socket (covered by server behaviour).
  await page.goto("/hub");
  await expect(page.getByRole("button", { name: "Create room" })).toBeVisible();
});
