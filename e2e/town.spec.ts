import { test, expect } from "@playwright/test";

/**
 * Town HUD interaction — the steppers, the hire action and the decision card,
 * now driven by the live solo season from `@millbrook/economy`. Reasons are
 * data-driven, so these assert behaviour (values, bounds, the reason changing)
 * rather than exact rival names. Runs on both the desktop and phone projects.
 */
test.describe("Town HUD", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/play");
  });

  test("raising the bread price updates the value and its reason", async ({ page }) => {
    const bakery = page.getByRole("region", { name: "Your bakery" });
    await expect(bakery.getByText("3 coins")).toBeVisible();

    await bakery.getByRole("button", { name: "Raise the bread price" }).click();
    await expect(bakery.getByText("4 coins")).toBeVisible();

    // Push to the ceiling: the reason turns to the "steep" tier and + disables.
    const raise = bakery.getByRole("button", { name: "Raise the bread price" });
    await raise.click();
    await raise.click();
    await expect(bakery.getByText("6 coins")).toBeVisible();
    await expect(raise).toBeDisabled();
    await expect(bakery.getByText(/Steep/)).toBeVisible();
  });

  test("the wage stepper clamps at its lower bound", async ({ page }) => {
    const bakery = page.getByRole("region", { name: "Your bakery" });
    const lower = bakery.getByRole("button", { name: "Lower the wage" });
    // 8 → 5 is three decrements; the button disables at the floor.
    for (let i = 0; i < 3; i++) await lower.click();
    await expect(bakery.getByText("5 a day")).toBeVisible();
    await expect(lower).toBeDisabled();
  });

  test("hiring a baker records it in the town feed", async ({ page }) => {
    const bakery = page.getByRole("region", { name: "Your bakery" });
    await bakery.getByRole("button", { name: /Hire a baker/ }).click();
    await expect(page.getByText(/You hired/)).toBeVisible();
  });

  test("the Game Master card goes live once an event fires and explains itself", async ({ page }) => {
    const gm = page.getByRole("region", { name: "Game Master" });
    // At day 1 the card is idle, watching the town.
    await expect(gm.getByText("Watching the weather and the town.")).toBeVisible();

    // Run the season; within a game week an event fires and the card updates.
    await page.getByRole("button", { name: "Play" }).click();
    await expect(gm.getByText("From the Game Master")).toBeVisible({ timeout: 20000 });
    await page.getByRole("button", { name: "Pause" }).click();

    // "Why did this happen?" reveals the reasoning and the data it read.
    await gm.getByRole("button", { name: "Why did this happen?" }).click();
    await expect(gm.getByTestId("gm-why-panel")).toBeVisible();
  });
});
