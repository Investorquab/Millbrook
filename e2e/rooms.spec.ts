import { test, expect } from "@playwright/test";

/**
 * Rooms over the live game server (Socket.IO on :8080, started by the Playwright
 * webServer config). Proves the web client wired in M5: host a room, see the
 * live invite code and the host's own slot, start the season, and watch the
 * shared live town tick. A second browser context joins by code to prove the
 * invite flow — two clients in one real room.
 *
 * These assert behaviour against the real server, not a mock: if the protocol
 * or the RoomProvider wiring breaks, this fails.
 */
test.describe("Rooms", () => {
  test("host creates a room, sees a live code, and starts the shared season", async ({ page }) => {
    await page.goto("/hub");

    // Host from the hub.
    await page.getByRole("button", { name: "Create room" }).click();

    // We land in the room as the host, with a real invite code from the server.
    await expect(page.getByText("You're the host")).toBeVisible({ timeout: 15000 });
    const codeEl = page.locator(".room__code-value");
    await expect(codeEl).toBeVisible();
    const code = (await codeEl.textContent())?.trim() ?? "";
    expect(code).toMatch(/^[A-Z2-9]{6}$/);

    // The host fills the first workshop slot by name.
    await expect(page.locator(".room__slot--filled").first()).toContainText("millhand");

    // Start the season; the lobby gives way to the live town.
    await page.getByRole("button", { name: "Start the season" }).click();
    const stats = page.getByLabel("Live town");
    await expect(stats).toBeVisible();

    // The server ticks the day forward on its own (ROOM_DAY_MS); the day climbs.
    await expect(async () => {
      const day = await stats.locator("b").first().textContent();
      const n = parseInt(day?.split("/")[0] ?? "0", 10);
      expect(n).toBeGreaterThan(1);
    }).toPass({ timeout: 15000 });
  });

  test("a second player joins by code into the same room", async ({ page, browser }) => {
    // Host a room in the first context.
    await page.goto("/hub");
    await page.getByRole("button", { name: "Create room" }).click();
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

    // The guest sees the room and is told the host runs it.
    await expect(guest.getByText("In the room", { exact: true })).toBeVisible({ timeout: 15000 });
    await expect(guest.locator(".room__slots")).toContainText("baker-jo");

    // The host now sees two players in the room.
    await expect(page.locator(".room__playercount")).toContainText("2 in the room");

    await guestContext.close();
  });
});
