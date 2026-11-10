# How to hand Millbrook to another Claude

This folder is laid out the way your two repositories should look. This file is for you; don't commit it.

```
millbrook/                     -> public GitHub repo (judges see this)
  CLAUDE.md                    agent instructions, skills to install, public/private rules
  .claude/skills/premium-game-ui/SKILL.md   project skill, loaded automatically by Claude Code
  design/                      the approved screens, ready to port
    README.md                  screen map, design tokens, components, known fixes
    screenshots/*.png          every screen at 1440x900
    static/*.html              click-through version; open static/Main.html
    screens/*.dc.html          original design sources with their small bits of logic
    assets/*.svg               town art and the 8 characters (full body + portrait)
    art-generators/*.py        scripts that drew the art, for small tweaks
  .gitignore                   ignores private/, .env, key files, local Claude settings
  scripts/check-public.sh      blocks pushes that would leak private files or keys
  scripts/install-hooks.sh     installs that check as a pre-push hook
  private/                     -> separate PRIVATE GitHub repo (millbrook-private)
    BUILD_PLAN.md, GAME_DESIGN.md, VIDEO.md, SUBMISSION.md, README.md
```

## Setup (about 10 minutes)

1. On GitHub, create two repos: `millbrook` and `millbrook-private`. Set `millbrook-private` to **Private**. `millbrook` can stay private while you build, but it **must be public before 14 Nov, 23:59 UTC**.
2. Put everything except `private/` and this file into `millbrook`. Run `bash scripts/install-hooks.sh` once.
3. Put the contents of `private/` in `millbrook-private`, then clone it into `millbrook/private`.
4. Open the folder in Claude Code. It picks up `CLAUDE.md` and the `premium-game-ui` skill on its own; `CLAUDE.md` tells it to install the frontend-design plugin, the NEAR agent skills and Playwright.
5. Put your keys in `.env` on the machines that need them. Never paste a key into a chat.

## First message to the other Claude

> Read CLAUDE.md, then private/BUILD_PLAN.md, private/GAME_DESIGN.md and design/README.md. Install the skills and tools listed in CLAUDE.md and tell me if any fail. Then start milestone M0: list the tasks you'll do, the files you'll create, and anything you need from me (accounts, keys in .env, the domain). The screens are already designed in design/: port them, don't redesign them or regenerate the art. Ask before any push, mainnet deploy or post.

## What it will and won't do on its own

- It will follow the plan, the tiers, the designs and the public/private rules, and stop to ask before pushing, posting, mainnet or spending.
- It can't create accounts, buy the domain, get API keys, record the video or submit the form. Those are on the "Human-only tasks" list.
- Check in at the end of each milestone: run the acceptance checks yourself and compare its screenshots with `design/screenshots/`.
