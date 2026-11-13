import { test, expect } from "@playwright/test";

/**
 * The passwordless magic-link sign-in, end to end against the real server.
 * In development the server returns the link in the response (no email key
 * needed), so the page shows an "Open your sign-in link" button; clicking it
 * verifies the token, mints a session and lands on the hub as that user.
 */
test("sign in with a magic link and land on the hub", async ({ page }) => {
  test.setTimeout(45_000);
  const username = `Ada${Date.now() % 100000}`;

  await page.goto("/signin");
  await page.getByLabel("Email").fill("ada@example.com");
  await page.getByLabel("Username").fill(username);
  await page.getByRole("button", { name: "Send login link" }).click();

  // Dev: the link comes back in the response, surfaced as a button.
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
  await page.getByRole("link", { name: "Open your sign-in link" }).click();

  // The verify page signs us in and forwards to the hub. The account chip is
  // hidden on narrow screens, so assert its text rather than its visibility.
  await expect(page).toHaveURL(/\/hub$/);
  await expect(page.locator(".hub__account-name")).toHaveText(username);

  // The session persists across a reload (localStorage).
  await page.reload();
  await expect(page.locator(".hub__account-name")).toHaveText(username);
});

test("hosting a room requires signing in first", async ({ page }) => {
  test.setTimeout(45_000);
  await page.goto("/hub");
  // Signed out: the host button sends us to sign-in rather than a room.
  await page.getByRole("button", { name: "Live room" }).click();
  await expect(page).toHaveURL(/\/signin$/);
});
