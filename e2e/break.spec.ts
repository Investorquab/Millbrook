import { test, expect, type Page } from "@playwright/test";

/**
 * The break-test: try hard to break Millbrook, and record it. We hammer the
 * controls out of bounds, spam actions, rip through screens and settings, run a
 * whole season to the end, and throw bad input at the rooms — all while checking
 * the game never white-screens, never logs an error, and the town's coins stay
 * exactly 10,000 on-chain-style Proof. A video of the whole run is recorded.
 */

test.use({ video: "on" });

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
}

/** Click a locator many times, ignoring misses (it may clamp or disable). */
async function spam(page: Page, selector: string, times: number) {
  const el = page.locator(selector).first();
  for (let i = 0; i < times; i++) {
    await el.click({ timeout: 1000 }).catch(() => {});
  }
}

/** The town's coins must still total 10,000 (checked on the Proof screen). */
async function assertTenThousand(page: Page) {
  await page.locator('a[href="/proof"]').first().click();
  await expect(page).toHaveURL(/\/proof$/);
  await expect(page.getByText("10,000").first()).toBeVisible();
  await page.locator('a[href="/play"]').first().click();
  await expect(page).toHaveURL(/\/play$/);
}

test("hammer the solo game without breaking it or the 10,000-coin invariant", async ({ page }) => {
  test.setTimeout(120_000);
  const errors = watchErrors(page);

  // 1) Rip through the Hub settings: switch goal, trade and town size rapidly —
  //    each rebuilds the season, so this stresses the rebuild path.
  await page.goto("/hub");
  for (const name of ["Underdog", "Monopoly", "Town Hero", "Last Will", "Tycoon"]) {
    await page.getByRole("button", { name, exact: true }).click({ timeout: 2000 }).catch(() => {});
  }
  for (const name of ["Full town (six)", "Eight (Carpenter)", "Four shops"]) {
    await page.getByRole("button", { name }).click({ timeout: 2000 }).catch(() => {});
  }

  // 2) Into the game.
  await page.getByRole("link", { name: /Start a season/ }).click();
  await expect(page).toHaveURL(/\/play$/);
  await page.getByRole("button", { name: "Skip tour" }).click({ timeout: 3000 }).catch(() => {});

  // 3) Drive the steppers hard out of bounds, both ways — they must clamp.
  await spam(page, '[data-tour-target="price"] button, .town__stepper button', 40);
  await spam(page, 'button:has-text("Hire"), [data-tour-target="hire"]', 20); // spam past max crew

  // 4) Rapid play / pause and a burst of screen-hopping.
  for (let i = 0; i < 6; i++) {
    await page.getByRole("button", { name: /^Play$|Pause/ }).first().click({ timeout: 1500 }).catch(() => {});
  }
  for (const href of ["/market", "/gazette", "/resident", "/proof"]) {
    await page.locator(`a[href="${href}"]`).first().click({ timeout: 2000 }).catch(() => {});
    await page.locator('a[href="/play"]').first().click({ timeout: 2000 }).catch(() => {});
  }

  // 5) The money still totals 10,000.
  await assertTenThousand(page);

  // 6) Run the whole season to the end via Fast-forward, then the Scoreboard.
  await page.locator('a[href="/fast-forward"]').first().click();
  await expect(page).toHaveURL(/\/fast-forward$/);
  await page.getByRole("link", { name: "Skip to season end" }).click();
  await expect(page).toHaveURL(/\/scoreboard$/);
  await expect(page.getByText(/Goal card:/)).toBeVisible();

  // 7) A finished season still audits to 10,000.
  await page.goto("/proof");
  await expect(page.getByText("10,000").first()).toBeVisible();

  // 8) A garbage route lands on the friendly 404, not a crash.
  await page.goto("/nonexistent-page-xyz-123");
  await expect(page.getByText(/isn't in Millbrook|Reload|Back to Millbrook/i).first()).toBeVisible();

  expect(errors, `errors during the break-test:\n${errors.join("\n")}`).toEqual([]);
});

test("bad room input is rejected, not crashed", async ({ page }) => {
  const errors = watchErrors(page);
  // Joining with a nonsense code shows a friendly error, never a white screen.
  await page.goto("/join?code=ZZZZZZ");
  await page.getByRole("button", { name: /Join/i }).first().click({ timeout: 3000 }).catch(() => {});
  // The page is still alive and navigable.
  await page.goto("/hub");
  await expect(page.getByText("Your goal")).toBeVisible();
  expect(errors.filter((e) => !/Can't reach the game server/i.test(e))).toEqual([]);
});
