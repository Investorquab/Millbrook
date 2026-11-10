import { test, expect } from "@playwright/test";

/**
 * Town HUD interaction — the price/wage steppers and the Game Master decision
 * card behave as designed (logic ported from `design/screens/Town.dc.html`).
 * This runs on the desktop project; the phone project repeats it responsively.
 */
test.describe("Town HUD", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/play");
  });

  test("raising the bread price updates the value and its reason", async ({ page }) => {
    const bakery = page.getByRole("region", { name: "Your bakery" });
    await expect(bakery.getByText("3 coins")).toBeVisible();
    await expect(bakery.getByText("Same as Gus. Most residents can afford it.")).toBeVisible();

    await bakery.getByRole("button", { name: "Raise the bread price" }).click();

    await expect(bakery.getByText("4 coins")).toBeVisible();
    await expect(bakery.getByText("Above Gus. Thrifty residents will shop there instead.")).toBeVisible();
    // Sold falls as the price rises (40 - (4-3)*9 = 31).
    await expect(bakery.getByText("31 loaves")).toBeVisible();
  });

  test("the wage stepper clamps at its lower bound", async ({ page }) => {
    const bakery = page.getByRole("region", { name: "Your bakery" });
    const lower = bakery.getByRole("button", { name: "Lower the wage" });
    // 8 → 5 is three decrements; the button disables at the floor.
    for (let i = 0; i < 3; i++) await lower.click();
    await expect(bakery.getByText("5 a day")).toBeVisible();
    await expect(lower).toBeDisabled();
  });

  test("deciding on the drought swaps the card for a confirmation", async ({ page }) => {
    const decision = page.getByRole("region", { name: "Decision" });
    await expect(decision.getByText("Drought. Wheat costs three times as much for 5 days.")).toBeVisible();

    await decision.getByRole("button", { name: "Lock in wheat for 240 coins" }).click();

    await expect(page.getByText("Wheat locked in at today's price for 5 days.")).toBeVisible();
    await expect(page.getByText("Drought. Wheat costs three times as much for 5 days.")).toBeHidden();
  });
});
