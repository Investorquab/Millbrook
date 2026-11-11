import { test } from "@playwright/test";

/** Capture the room lobby and the live room for the premium-game-ui review. */
test("capture room screens", async ({ page, browser }, testInfo) => {
  const tag = testInfo.project.name;
  await page.goto("/hub");
  await page.getByRole("button", { name: "Create room" }).click();
  await page.locator(".room__code-value").waitFor();
  await page.screenshot({ path: `e2e/__screens__/room-lobby-${tag}.png`, fullPage: true });

  // A guest's lobby: the claim buttons on the open shops, and a claimed shop.
  const code = ((await page.locator(".room__code-value").textContent()) ?? "").trim();
  const guestCtx = await browser.newContext({ viewport: page.viewportSize() ?? undefined });
  const guest = await guestCtx.newPage();
  await guest.goto(`/join?code=${code}`);
  await guest.getByLabel("Your name").fill("baker-jo");
  await guest.getByLabel("Room code").fill(code);
  await guest.getByRole("button", { name: "Join the room" }).click();
  await guest.locator(".room__slot", { hasText: "Weaver" }).getByRole("button", { name: "Claim this shop" }).click();
  await guest.locator(".room__slot--mine").waitFor();
  await guest.screenshot({ path: `e2e/__screens__/room-claim-${tag}.png`, fullPage: true });

  await page.getByRole("button", { name: "Start the season" }).click();
  await page.getByLabel("Live town").waitFor();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `e2e/__screens__/room-live-${tag}.png`, fullPage: true });
  await guestCtx.close();
});
