---
name: "premium-game-ui"
description: "Use when building a browser game's visuals: 3D diorama scenes, game HUDs and panels, characters and portraits, motion and feedback. Aims for a premium game feel, not an app look."
---

# Premium game UI

The goal: from the first frame, the player should feel they are in a game world, not using a web app. The world is the hero; the interface is a quiet frame around it.

Use this together with the `frontend-design` skill when it is available. That skill covers type, color and copy in general; this one covers what is specific to games.

## 1. Decide the art direction before any code

Write a one-page plan first:

- **The world in one sentence** (for example: "a miniature mill town at dusk, seen like a model village on a table").
- **Camera:** angle, distance, zoom limits. Diorama games usually use a tilted perspective camera with a narrow field of view (25 to 35 degrees), or an orthographic camera.
- **Palette:** 5 or 6 named hex values taken from the world's own materials. Name them after things in the world, not after their roles.
- **Type:** one display face with character (signs, titles), plus one highly legible sans with tabular figures for numbers. Load both from Google Fonts.
- **The one bold element:** the single effect people will remember (for example, gold coins flowing between characters). Everything else stays quiet.

Then check the plan for generic defaults: cream backgrounds with a terracotta accent, near-black with one neon accent, identical rounded SaaS cards with soft grey shadows, ALL-CAPS eyebrow labels. If a choice would fit any game, replace it with one that fits this world.

## 2. The scene (React Three Fiber / three.js)

- Load models as glTF/GLB. Compress with meshopt or Draco when files pass about 1 MB.
- Use instancing for anything repeated (trees, fences, crates, coins).
- Budget: under about 40 animated characters on screen, under about 150 draw calls, 60 fps on a mid-range laptop. Measure with `r3f-perf` or the browser's performance panel.
- Lighting: one warm directional "sun" with soft shadows, plus a cool ambient or hemisphere fill. Let the time of day move the sun's angle and color.
- Optional post-processing, used lightly: ambient occlusion, a slight depth-of-field blur at the edges (miniature look), gentle bloom on lamps and coins. Turn post-processing off on low-power devices.
- The state of the simulation must be visible in the world: smoke from busy buildings, boarded windows after bankruptcy, crowds at events.

## 3. Characters

- Start from CC0 kits (Kenney, KayKit, Quaternius). Check each pack's license on its own page, and keep a `LICENSES.md` listing every asset pack, its URL and its license.
- Make each character readable from far away by **silhouette** first (hats, aprons, tools, coats), then color.
- Build variety from a few base models: swap colors, accessories and held props. Give every character a name and one visible trait.
- Important characters (rivals, bosses) get a unique silhouette and a signature color.
- Render portraits from the 3D models (an offscreen camera at head height) so faces match across cards, chat and news.
- Animation set per character at minimum: idle, walk, work, celebrate, upset. Retarget animations if the rigs differ between packs.
- Every design is original. Never recreate, trace or closely imitate a character, mascot or logo from another game or brand.

## 4. HUD and panels

- The world fills the screen. Panels sit at the edges and never cover the centre.
- Hierarchy: a slim top bar (time, money, one health signal), a context panel for what's selected, a feed for events, and decision cards that rise into view when needed.
- Panels use a dark, slightly translucent base with one thin accent edge, so the bright world stays the hero. Vary corner radius and weight by importance; don't make every panel identical.
- Numbers use tabular figures, right-aligned in columns, with units. Show change with small arrows and color, never color alone.
- Every button says what it does ("Hire Ada", "Raise wage to 9"). Every element keeps its name across the flow.
- Tooltips explain the world's reasoning in one plain line ("Skipping cloth: wage was cut").

## 5. Motion and feedback ("juice")

- Every player action gets an immediate response within 100 ms: a press state, a sound, a small motion.
- Results get a short celebration in proportion to their size: a coin clink for a sale, a burst for a record day. Keep most motion under 300 ms; reserve longer sequences for one signature moment.
- Animate cause and effect along a path (coins fly from buyer to shop), so the player sees why numbers changed.
- Respect `prefers-reduced-motion`: swap travel animations for fades and keep information intact.

## 6. Sound

- A soft ambient loop, short UI sounds (click, confirm, error), and world sounds tied to events. Use CC0 packs and list them in `LICENSES.md`.
- Default volume low, with a visible mute toggle. Never autoplay loud audio.

## 7. Accessibility and quality floor

- Text on panels meets 4.5:1 contrast. Minimum body size 14 px; numbers 15 px or more.
- Every action is reachable by keyboard, with visible focus.
- Color-blind safe: pair every red/green signal with an icon or arrow.
- Works at 1280x720 and up, and degrades gracefully on a phone (panels become a bottom sheet; the scene simplifies).

## 8. Review loop

After each visual change, take screenshots with Playwright at 1440x900 and 390x844 and look at them before moving on. Check:

1. Is the world the first thing you see?
2. Can you tell what every character does from its silhouette?
3. Is there exactly one bold element?
4. Does any panel look like a generic web app card? If so, redesign it.
5. Does it hold 60 fps with the performance panel open?

Then remove one decoration before calling it done.