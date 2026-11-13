import { test } from "@playwright/test";

/**
 * Video stills — captures clean 1440×900 frames of the real app (and the live
 * on-chain explorer) into private/video/shots/ for the hackathon video.
 * Run: npx playwright test e2e/video-shots.spec.ts --project=desktop
 */
const OUT = "private/video/shots";

/** A plain screen: go there, let it settle, shoot it. */
const screens: { name: string; path: string; settle?: number }[] = [
  { name: "01-title", path: "/", settle: 1200 },
  { name: "03-hub-pickers", path: "/hub", settle: 1200 },
  { name: "04-town-3d", path: "/play", settle: 4500 },
  { name: "05-market", path: "/market", settle: 1500 },
  { name: "06-proof-onchain", path: "/proof", settle: 5500 },
  { name: "07-fast-forward", path: "/fast-forward", settle: 2600 },
  { name: "08-scoreboard", path: "/scoreboard", settle: 1500 },
  { name: "09-gazette", path: "/gazette", settle: 1500 },
  { name: "10-resident", path: "/resident", settle: 1200 },
];

for (const s of screens) {
  test(`shot ${s.name}`, async ({ page }) => {
    await page.goto(s.path);
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(s.settle ?? 800);
    await page.screenshot({ path: `${OUT}/${s.name}.png`, fullPage: false });
  });
}

/** A livelier town: press Play so the coin-flow and movement are visible. */
test("shot 04b-town-live", async ({ page }) => {
  await page.goto("/play");
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(3500);
  try {
    const play = page.getByRole("button", { name: /^Play$/ }).first();
    if (await play.isVisible()) await play.click();
  } catch {
    /* no Play button in this state — the opening frame is fine */
  }
  await page.waitForTimeout(4000);
  await page.screenshot({ path: `${OUT}/04b-town-live.png`, fullPage: false });
});

/** The live on-chain proof: the contract page on the NEAR testnet explorer. */
test("shot 11-explorer", async ({ page }) => {
  await page.goto("https://testnet.nearblocks.io/address/game.millbrook.testnet", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForTimeout(6000);
  await page.screenshot({ path: `${OUT}/11-explorer-contract.png`, fullPage: false });
});
