import { test } from "@playwright/test";

/**
 * Screenshot review — captures each ported screen at 1440x900 (desktop project)
 * and 390x844 (phone project) for the `premium-game-ui` checklist. Not an
 * assertion test; the images land in `e2e/__screens__/` for eyeballing.
 */
const screens = [
  { name: "title", path: "/" },
  { name: "signin", path: "/signin" },
  { name: "hub", path: "/hub" },
  { name: "town", path: "/play" },
];

for (const screen of screens) {
  test(`screenshot ${screen.name}`, async ({ page }, testInfo) => {
    await page.goto(screen.path);
    // Let fonts and the SVG town settle.
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(400);
    await page.screenshot({
      path: `e2e/__screens__/${screen.name}-${testInfo.project.name}.png`,
      fullPage: false,
    });
  });
}
