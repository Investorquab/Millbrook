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

  test("the Foreman runs standing orders and reports what it did", async ({ page }) => {
    test.setTimeout(45_000); // the note appears after a few real-time game days
    const bakery = page.getByRole("region", { name: "Your bakery" });
    await bakery.getByRole("button", { name: /Hire a baker/ }).click();
    // Drop our wage to the floor so a rival almost certainly out-pays us,
    // giving the Foreman something to match.
    const lower = bakery.getByRole("button", { name: "Lower the wage" });
    for (let i = 0; i < 3; i++) await lower.click();

    // Open the Foreman panel and turn on both standing orders (off by default).
    await bakery.getByRole("button", { name: "Foreman's orders" }).click();
    const foreman = page.getByRole("region", { name: "Foreman's standing orders" });
    await expect(foreman).toBeVisible();
    await foreman.getByText("Match rival wages to keep my workers").click();
    // The wage cap stepper appears once matching is on.
    await expect(foreman.getByText(/Wage cap/)).toBeVisible();
    await foreman.getByText("Hire when demand for bread goes unmet").click();

    // Run the season; within a few days the Foreman acts and leaves a note.
    await page.getByRole("button", { name: "Play" }).click();
    await expect(page.locator(".town__foreman-note")).toBeVisible({ timeout: 30000 });
    await page.getByRole("button", { name: "Pause" }).click();
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
