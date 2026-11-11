# Licenses & assets

Millbrook ships only assets that are free for commercial use. Everything here is
either **original to this project** or **CC0 / open-licensed**, with its source
and license named below.

## Original art (made for Millbrook)

| Asset | Where | License |
| --- | --- | --- |
| The 3D town diorama — every building, character, tree, the ground and props | `apps/web/src/town3d/` | Original. Built entirely from three.js primitives in code; **no external model packs are used**. CC0 / public domain, by this project. |
| 2D character art (full-body + portraits) | `apps/web/public/art/char-*.svg`, `face-*.svg` (sources in `design/assets/`) | Original to this project, drawn by the `design/art-generators/` scripts. CC0. |
| 2D town stand-in | `design/assets/town.svg` | Original to this project (the 3D scene has replaced it in-game). CC0. |
| Sound effects (coin chime, clicks, Game Master cue) | `apps/web/src/game/sound.ts` | Original. Synthesized in code with the Web Audio API (oscillators + envelopes); **no external audio files are used**. CC0, by this project. |

No character, mascot, building or logo is copied, traced or closely imitated
from any other game or brand.

## Fonts (Google Fonts, open source)

| Font | Use | License |
| --- | --- | --- |
| [Grenze](https://fonts.google.com/specimen/Grenze) | Headings, building signs, the Gazette masthead | SIL Open Font License 1.1 |
| [Barlow](https://fonts.google.com/specimen/Barlow) / Barlow Semi Condensed | Body text and all numbers | SIL Open Font License 1.1 |

## Data feeds

| Feed | Use | Terms |
| --- | --- | --- |
| [Open-Meteo](https://open-meteo.com) | Real-world weather → Game Master events | Free, no API key; CC BY 4.0 data |

## CC0 kits available for future use (not currently bundled)

The design referenced these CC0 packs (`private/GAME_DESIGN.md`). They are **not
in the repo today** — the in-game town is built from primitives instead — but are
listed here so any future swap stays CC0 and attributed by choice (CC0 requires
no attribution):

- [KayKit Medieval Hexagon](https://kaylousberg.com/game-assets/medieval-hexagon) — CC0
- [KayKit Character Animations](https://kaylousberg.com/game-assets/character-animations) — CC0
- [Kenney Mini Characters](https://kenney.nl/assets/mini-characters) and Kenney UI/audio packs — [CC0](https://kenney.nl/support)

If any of these are added later, move them up into the table above with the files
they cover.
