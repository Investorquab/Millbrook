import { test } from "@playwright/test";

/** Capture the room lobby and the live room for the premium-game-ui review. */
test("capture room screens", async ({ page }, testInfo) => {
  const tag = testInfo.project.name;
  await page.goto("/hub");
  await page.getByRole("button", { name: "Create room" }).click();
  await page.locator(".room__code-value").waitFor();
  await page.screenshot({ path: `e2e/__screens__/room-lobby-${tag}.png`, fullPage: true });

  await page.getByRole("button", { name: "Start the season" }).click();
  await page.getByLabel("Live town").waitFor();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `e2e/__screens__/room-live-${tag}.png`, fullPage: true });
});
