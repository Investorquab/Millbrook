import { test } from "@playwright/test";
import { signIn } from "./helpers";

/** Capture the room lobby and the live room for the premium-game-ui review. */
test("capture room screens", async ({ page, browser }, testInfo) => {
  const tag = testInfo.project.name;
  await signIn(page, "Ada");
  await page.getByRole("button", { name: "Live room" }).click();
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
  // A couple of chat lines so the panel shows in the capture.
  const guestChat = guest.getByLabel("Room chat");
  await guestChat.getByLabel("Chat message").fill("taking the weaver — good luck all");
  await guestChat.getByRole("button", { name: "Send" }).click();
  await page.getByLabel("Room chat").getByText(/weaver/).first().waitFor();
  await guest.screenshot({ path: `e2e/__screens__/room-claim-${tag}.png`, fullPage: true });

  await page.getByRole("button", { name: "Start the season" }).click();
  await page.getByLabel("Live town").waitFor();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `e2e/__screens__/room-live-${tag}.png`, fullPage: true });
  await guestCtx.close();
});
