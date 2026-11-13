import { test, expect } from "@playwright/test";
import { signIn } from "./helpers";

/**
 * League rooms over the real server: a season that advances on a schedule, with
 * Ready-to-skip. A solo host is the only present player, so pressing Ready (1/1)
 * advances a day at once — proving the server's league + ready wiring end to end.
 */
test("a League room advances a day when the host is ready to skip", async ({ page }) => {
  await signIn(page, "Lee");
  await page.getByRole("button", { name: "League room" }).click();

  await expect(page.getByText("You're the host")).toBeVisible({ timeout: 15000 });
  await page.getByRole("button", { name: "Start the season" }).click();

  // The League strip shows the schedule and a Ready button.
  const strip = page.getByRole("group", { name: "League" });
  await expect(strip).toBeVisible({ timeout: 15000 });
  await expect(strip).toContainText(/Season 1/);

  const stats = page.getByLabel("Live town");
  const dayNow = async () => {
    const t = await stats.locator("b").first().textContent();
    return parseInt(t?.split("/")[0] ?? "1", 10);
  };
  const before = await dayNow();

  // Everyone present (just the host) is ready → a day advances now, not on the clock.
  await page.getByRole("button", { name: /Ready to skip/ }).click();
  await expect(async () => {
    expect(await dayNow()).toBeGreaterThan(before);
  }).toPass({ timeout: 10000 });
});
