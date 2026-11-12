import type { Page } from "@playwright/test";

/**
 * Sign a page in through the real magic-link flow (dev returns the link in the
 * response, so no email is needed), leaving it on the hub as `username`.
 */
export async function signIn(page: Page, username: string): Promise<void> {
  await page.goto("/signin");
  await page.getByLabel("Email").fill(`${username.toLowerCase()}@example.com`);
  await page.getByLabel("Username").fill(username);
  await page.getByRole("button", { name: "Send login link" }).click();
  await page.getByRole("link", { name: "Open your sign-in link" }).click();
  await page.waitForURL(/\/hub$/);
}
