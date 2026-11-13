import { test, expect } from "@playwright/test";
import { signIn } from "./helpers";

/**
 * Rooms over the live game server (Socket.IO on :8080, started by the Playwright
 * webServer config). Proves the M5 web client against the real server: host a
 * room, see the live invite code, claim shops, start the season, and that each
 * player runs their OWN shop (host → bakery, a joiner → the shop they claim).
 *
 * These assert behaviour against the real server, not a mock: if the protocol
 * or the RoomProvider wiring breaks, this fails.
 */
test.describe("Rooms", () => {
  test("host creates a room, sees a live code, and starts the shared season", async ({ page }) => {
    await signIn(page, "Ada");
    await page.getByRole("button", { name: "Live room" }).click();

    // We land in the room as the host, with a real invite code from the server.
    await expect(page.getByText("You're the host")).toBeVisible({ timeout: 15000 });
    const codeEl = page.locator(".room__code-value");
    await expect(codeEl).toBeVisible();
    const code = (await codeEl.textContent())?.trim() ?? "";
    expect(code).toMatch(/^[A-Z2-9]{6}$/);

    // The host runs the bakery; their own slot reads "You".
    const bakerySlot = page.locator(".room__slot", { hasText: "Bakery" });
    await expect(bakerySlot).toContainText("You");
    await expect(bakerySlot).toContainText("runs the bakery");

    // Start the season; the lobby gives way to the live town, which ticks on.
    await page.getByRole("button", { name: "Start the season" }).click();
    const stats = page.getByLabel("Live town");
    await expect(stats).toBeVisible();
    await expect(async () => {
      const day = await stats.locator("b").first().textContent();
      const n = parseInt(day?.split("/")[0] ?? "0", 10);
      expect(n).toBeGreaterThan(1);
    }).toPass({ timeout: 15000 });
  });

  test("a joiner claims a shop and runs it; the host sees them in that slot", async ({ page, browser }) => {
    // Host a room.
    await signIn(page, "Ada");
    await page.getByRole("button", { name: "Live room" }).click();
    await expect(page.getByText("You're the host")).toBeVisible({ timeout: 15000 });
    const code = ((await page.locator(".room__code-value").textContent()) ?? "").trim();
    expect(code).toMatch(/^[A-Z2-9]{6}$/);

    // A second player joins by the invite link in a fresh context.
    const guestContext = await browser.newContext();
    const guest = await guestContext.newPage();
    await guest.goto(`/join?code=${code}`);
    await guest.getByLabel("Your name").fill("baker-jo");
    await guest.getByLabel("Room code").fill(code);
    await guest.getByRole("button", { name: "Join the room" }).click();
    await expect(guest.getByText("In the room", { exact: true })).toBeVisible({ timeout: 15000 });

    // The guest claims the Weaver; the host now sees baker-jo in the Weaver slot.
    const guestWeaver = guest.locator(".room__slot", { hasText: "Weaver" });
    await guestWeaver.getByRole("button", { name: "Claim this shop" }).click();
    await expect(guestWeaver).toContainText("You");
    const hostWeaver = page.locator(".room__slot", { hasText: "Weaver" });
    await expect(hostWeaver).toContainText("baker-jo");
    await expect(page.locator(".room__playercount")).toContainText("2 in the room");

    // Host starts; the guest runs their OWN shop — a Cloth price stepper.
    await page.getByRole("button", { name: "Start the season" }).click();
    const guestShop = guest.getByLabel("Your shop");
    await expect(guestShop).toBeVisible({ timeout: 15000 });
    await expect(guestShop.getByText(/Cloth price/)).toBeVisible();
    await guestShop.getByRole("button", { name: "Raise the cloth price" }).click();

    // The guest never gets the host-only play/pause.
    await expect(guestShop.getByRole("button", { name: "Play" })).toHaveCount(0);

    await guestContext.close();
  });

  test("players chat and see each other's messages, plus join/claim notices", async ({ page, browser }) => {
    await signIn(page, "Ada");
    await page.getByRole("button", { name: "Live room" }).click();
    await expect(page.getByText("You're the host")).toBeVisible({ timeout: 15000 });
    const code = ((await page.locator(".room__code-value").textContent()) ?? "").trim();

    const guestContext = await browser.newContext();
    const guest = await guestContext.newPage();
    await guest.goto(`/join?code=${code}`);
    await guest.getByLabel("Your name").fill("baker-jo");
    await guest.getByLabel("Room code").fill(code);
    await guest.getByRole("button", { name: "Join the room" }).click();

    const hostChat = page.getByLabel("Room chat");
    const guestChat = guest.getByLabel("Room chat");

    // The host sees a system notice that the guest arrived.
    await expect(hostChat).toContainText("baker-jo joined the room.", { timeout: 15000 });

    // The host sends a line; the guest sees it attributed to the host.
    await hostChat.getByLabel("Chat message").fill("welcome aboard");
    await hostChat.getByRole("button", { name: "Send" }).click();
    await expect(guestChat).toContainText("welcome aboard");

    // The guest replies; the host sees it from baker-jo.
    await guestChat.getByLabel("Chat message").fill("glad to be here");
    await guestChat.getByRole("button", { name: "Send" }).click();
    await expect(hostChat).toContainText("glad to be here");
    await expect(hostChat.locator(".room__chat-line b", { hasText: "baker-jo" })).toBeVisible();

    // A claim posts a system notice both see.
    await guest.locator(".room__slot", { hasText: "Smithy" }).getByRole("button", { name: "Claim this shop" }).click();
    await expect(hostChat).toContainText("running the smithy");

    await guestContext.close();
  });

  test("a player posts a trade offer the others see, and can withdraw it", async ({ page, browser }) => {
    await signIn(page, "Ada");
    await page.getByRole("button", { name: "Live room" }).click();
    await expect(page.getByText("You're the host")).toBeVisible({ timeout: 15000 });
    const code = ((await page.locator(".room__code-value").textContent()) ?? "").trim();

    const guestContext = await browser.newContext();
    const guest = await guestContext.newPage();
    await guest.goto(`/join?code=${code}`);
    await guest.getByLabel("Your name").fill("smith-lee");
    await guest.getByLabel("Room code").fill(code);
    await guest.getByRole("button", { name: "Join the room" }).click();
    await guest.locator(".room__slot", { hasText: "Smithy" }).getByRole("button", { name: "Claim this shop" }).click();

    // Trading opens once the host starts the season.
    await page.getByRole("button", { name: "Start the season" }).click();
    const guestTrade = guest.getByLabel("Trade offers");
    await expect(guestTrade).toBeVisible({ timeout: 15000 });

    // The smith offers 2 tools for 8 coins to the room.
    await guestTrade.getByLabel("Quantity").fill("2");
    await guestTrade.getByLabel("Price in coins").fill("8");
    await guestTrade.getByRole("button", { name: "Post offer" }).click();

    // The host sees the offer with Accept/Decline.
    const hostTrade = page.getByLabel("Trade offers");
    await expect(hostTrade).toContainText("smith-lee");
    await expect(hostTrade).toContainText("2 tool for 8 coins");
    await expect(hostTrade.getByRole("button", { name: "Accept" })).toBeVisible();

    // The smith withdraws it; it clears for the host.
    await guestTrade.getByRole("button", { name: "Withdraw" }).click();
    await expect(hostTrade.getByRole("button", { name: "Accept" })).toHaveCount(0);

    await guestContext.close();
  });
});
