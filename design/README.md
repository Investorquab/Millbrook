# Millbrook screen designs

These are the approved screen designs. **Port them; don't redesign them, and don't regenerate the art.** Wire each screen to the simulation and server, and add only what the build plan asks for.

## What's in this folder

| Path | What it is | Use it to |
| --- | --- | --- |
| `screenshots/*.png` | Each screen at 1440x900 | See the target look. Open them before building a screen |
| `static/*.html` | Each screen as plain HTML; links between screens work | Click through in a browser; copy exact spacing, colors and copy |
| `screens/*.dc.html` | The original design sources, including the small interactive logic (state, handlers) | Read the logic for steppers, toggles and decision cards |
| `screens/canvas.json` | Screen list and order | Reference only |
| `assets/town.svg` | 2D stand-in for the 3D town (isometric diorama at dusk) | Placeholder until the 3D scene exists; match its camera angle and composition |
| `assets/char-*.svg`, `assets/face-*.svg` | Original character art, full body and portrait | Use as-is for portraits and cards; use as the reference for the 3D characters' outfits and colors |
| `art-generators/town.py`, `art-generators/cast.py` | The Python scripts that drew the SVGs | Tweak a color or an outfit by editing a value and re-running, instead of redrawing |

The screenshots were taken without web fonts, so headings show a fallback serif. The real fonts are **Grenze** (headings, signs) and **Barlow / Barlow Semi Condensed** (everything else), loaded from Google Fonts.

To view: open `static/Main.html` in a browser and click through.

## Screen map

| Screen | Files | Purpose | Links to | Wire up |
| --- | --- | --- | --- | --- |
| Title | `Main` | First screen; town hero, Gus and Fern in the corner | Town (Play solo), Lobby (Host, Join), SignIn | Guest play starts a solo season |
| Sign in | `SignIn` | Email and username, no wallet | Hub, Town (guest) | Magic-link email; creates the player's NEAR sub-account |
| Home | `Hub` | Solo, league status, host, join by code, trophies | Town, Lobby | League status from the server; trophies from the contract |
| Room lobby | `Lobby` | Code and invite link, 4 workshop slots, host accepts players, speed and goal card, chat | Town, Hub | Accept/remove, Live/League toggle (logic in the source), chat over WebSockets |
| In the town | `Town` | Main HUD: top bar, your workshop, Game Master decision card, town feed and chat, bubbles over residents | Resident, Proof, FastForward, Gazette, Hub | Price and wage steppers (logic in the source), decision card choices, feed from simulation events |
| Resident card | `Resident` | Ada's portrait, traits, wage, savings, needs, reasons for her choices | Town, Proof | Reasons come from `rules.ts`; "Offer a raise" logic in the source |
| Proof | `Proof` | Total coins, holdings bar, settlement and contract links, Follow a coin, Game Master receipt | Town | Real totals, transaction hashes and receipts from the server's transfer log |
| Fast-forward | `FastForward` | Progress, unemployment and wage charts, residents' share of money, what happened | Town, Scoreboard | Charts from simulation output; numbered markers match the event list |
| Gazette | `Gazette` | Weekly town newspaper written by NEAR AI | Town | Generated from the week's events; prices table from the simulation |
| Season end | `Scoreboard` | Standings, trophy, how the town did | Hub, Gazette | Scores from the goal card's scoring function |
| Cast and style | `Cast` | The 8 characters, palette, fonts, panel and button samples | Main | Reference only |

All numbers on these screens are sample data. Every `href="#"` is a placeholder for a real explorer or receipt link.

## Design tokens

Put these in one file (for example `apps/web/src/theme/tokens.ts`) and use only these.

| Token | Value | Use |
| --- | --- | --- |
| Millstone | `#2F3640` | Panels (at 0.94 to 0.97 opacity over the town) |
| Deep | `#1E242B`, insets `#232A32` | Page background behind dimmed scenes; wells inside panels |
| Linen | `#EDE6D6` | Main text; secondary buttons on dark |
| Secondary text | `#B9B2A4`, `#CFC8B8` | Labels and body copy on panels |
| Wheat gold | `#D9A441` (light `#F2C76B`, shadow `#A8761F`) | Coins, primary buttons, the coin flow, the brass edge |
| Meadow | `#6E9B5A`, text `#8FC07A` | Profit, good events |
| Madder | `#B23A48`, text `#E58A94` | Losses, strikes, warnings |
| River | `#5E8C93`, text `#8FB8C0` | Links, Proof panel, selection |
| Brass edge | `1px solid rgba(217,164,65,0.45 to 0.55)` | Main panels; decision cards use `2px solid #D9A441` |
| Radii | 8 (small), 10 to 12 (buttons, wells), 14 to 16 (panels), 18 to 22 (hero cards) | Vary by importance |
| Primary button | Wheat fill, Millstone text, 700 weight, `box-shadow: 0 3px 0 #A8761F` | One per screen |
| Numbers | Barlow Semi Condensed, `font-variant-numeric: tabular-nums` | Every coin, price and stat |

## Components to build once and reuse

TopBar, SpeedControl, CoinCounter, StatReadout, Panel (signboard), PrimaryButton, SecondaryButton, Stepper, SegmentedControl, Portrait, CharacterFigure, SpeechBubble, EventBadge, DecisionCard, Toast, FeedList, ChatPanel, PlayerSlotCard, GoalCardSummary, MoneyBar, CoinTrail (Follow a coin), LineChart with event markers, StandingsTable, TrophyCard, GazettePage.

## Known issues to fix while porting

- On the town screen, Ada's speech bubble runs under the feed panel. Keep bubbles clear of panels, or flip them to the other side.
- The designs are fixed at 1440x900. The game must work from 1280x720 up; on a phone, panels become a bottom sheet.
- `town.svg` is a stand-in. The 3D town (React Three Fiber with CC0 kits, see `private/GAME_DESIGN.md`) replaces it; keep the same tilted camera, dusk lighting and layout (river, square, workshops, Town Hall, mine).
- The two wide buttons on the decision card wrap with fallback fonts; check them with Barlow loaded.
