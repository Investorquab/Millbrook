# Deploy Millbrook to a VPS (a live URL)

Millbrook runs on one small VPS with Docker Compose: the Node game server,
Postgres, and **Caddy** (which serves the built web app and gets an HTTPS
certificate automatically). This takes ~15 minutes.

> Millbrook is **testnet only**. The only secret the server needs is the NEAR
> **testnet** operator key. Never put a mainnet key on the VPS.

## What you need

- A small VPS (e.g. Ubuntu 22.04, 1–2 GB RAM) with a public IP.
- A domain (or subdomain) with a **DNS `A` record pointing at the VPS IP** —
  Caddy needs it to issue the TLS certificate.
- Ports **80** and **443** open to the internet.

## One-time setup on the VPS

```bash
# 1. Install Docker + Compose, Node 22, and pnpm
curl -fsSL https://get.docker.com | sh
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt-get install -y nodejs
sudo corepack enable

# 2. Get the code
git clone https://github.com/Investorquab/Millbrook.git
cd Millbrook
pnpm install

# 3. Create the .env the server reads (copy the template, then edit)
cp .env.example .env
#   Fill in, at minimum:
#     NEAR_NETWORK=testnet
#     NEAR_OPERATOR_ACCOUNT_ID=millbrook.testnet
#     NEAR_OPERATOR_PRIVATE_KEY=ed25519:...        (the testnet operator key)
#     NEAR_CONTRACT_ID=millbrook.testnet
#     PUBLIC_BASE_URL=https://yourdomain.com
#   Everything else (NEAR AI, email, weather) has a working fallback and can
#   stay empty — see docs/SETUP.md. DATABASE_URL is set for you by compose.

# 4. Build the web app (Caddy serves the static files from apps/web/dist)
pnpm --filter @millbrook/web build
```

## Go live

```bash
cd infra
DOMAIN=yourdomain.com docker compose up -d --build
```

- The first build takes a few minutes (it installs the workspace in the server
  image). Caddy fetches the HTTPS certificate on first request.
- Open **https://yourdomain.com** — and verify the server:

```bash
curl https://yourdomain.com/health     # -> ok
```

That's it. The site (3D town, solo play, Proof reading the live contract) and
multiplayer rooms both run on that one domain — the web client talks to the
server **same-origin**, and Caddy proxies `/socket.io`, `/health`, `/rooms` and
`/api/*` (the sign-in routes) to it, so you do **not** need to set any server URL
at build time.

## Sign-in email (magic links)

Rooms require signing in; sign-in is a passwordless magic link. To send it by
email, set two values in `.env` on the VPS:

```bash
EMAIL_API_KEY=re_...                 # a Resend API key (resend.com, free tier)
EMAIL_FROM=onboarding@resend.dev     # or an address on a domain you verified in Resend
PUBLIC_BASE_URL=https://yourdomain.com   # so the link in the email points back here
```

- `onboarding@resend.dev` is Resend's sandbox sender; it only delivers to the
  email on your own Resend account. To email anyone, verify a domain in Resend
  and use an address on it. A plain `gmail.com` address is **not** a valid
  sender and Resend will reject it.
- Verify the key first: `node scripts/spikes/email.mjs` (prints OK or the exact
  fix; never prints the key).
- **No key?** Sign-in still works: the server prints each magic link to its log
  (`docker compose logs -f server`) instead of emailing it — fine for a demo,
  not for real users.

## Updating a running deploy

```bash
cd ~/Millbrook
git pull
pnpm install
pnpm --filter @millbrook/web build
cd infra && DOMAIN=yourdomain.com docker compose up -d --build
```

## Notes & troubleshooting

- **Local smoke test (no domain):** omit `DOMAIN` and Caddy serves on `:80` —
  `docker compose up -d --build`, then open `http://localhost`. (A local Docker
  daemon must be running.)
- **Logs:** `docker compose logs -f server` (or `caddy` / `db`).
- **Certificate didn't issue:** check the `A` record resolves to the VPS and
  that ports 80/443 are open; Caddy retries automatically.
- **Postgres** is provisioned (the `db` service) and wired via `DATABASE_URL`,
  but room state is currently in-memory — persistence across restarts is on the
  [Roadmap](../README.md#roadmap). The DB being up does no harm.
- **Secrets** live only in `.env` on the VPS. It is git-ignored and kept out of
  the Docker image by `.dockerignore`. If a key ever leaks, rotate it.

See [`ARCHITECTURE.md`](ARCHITECTURE.md) for how the server, contract and web fit
together, and [`DEMO.md`](DEMO.md) for the judge walkthrough.
