# Millbrook — setup & keys

Everything the game needs, and how to get each key. Put every value in `.env`
on the machine that needs it (copy from `.env.example`). **Never commit `.env`
or paste a key into chat.** The pure simulation (`pnpm sim`, `pnpm test`) needs
**no keys at all** — keys are only for the chain, the Game Master, login and the
live deploy.

| What | Needed for | Status |
| --- | --- | --- |
| NEAR testnet operator | accounts, gas, contract | ✅ created (`millbrook.testnet`) |
| NEAR AI Cloud key | Game Master, Gazette, Foreman messages | you create |
| OutLayer account/key | Game Master enclave + receipts | you create |
| Email provider key | magic-link login | you create |
| Weather API key | real-world Game Master events | you create (free) |
| Domain + VPS | the live deploy | later (M6) |
| Mainnet NEAR account | prize payout on the form | you create (M6) |

---

## 1. NEAR testnet operator — ✅ done

Already created and funded (10 test NEAR) as `millbrook.testnet`. The key is in
`~/.near-credentials/testnet/millbrook.testnet.json` and in `.env`
(`NEAR_OPERATOR_ACCOUNT_ID`, `NEAR_OPERATOR_PRIVATE_KEY`). Explorer:
<https://testnet.nearblocks.io/address/millbrook.testnet>.

To make another (e.g. a second town): `node scripts/spikes/create-operator.mjs <name>.testnet`.

Player accounts will be sub-accounts like `ada.millbrook.testnet`, created by the
server at sign-up (M3). Nothing here touches mainnet.

## 2. NEAR AI Cloud — reasoning for the Game Master, the Gazette, Foreman

1. Sign up at <https://cloud.near.ai>.
2. Open the **Developer Dashboard → API Keys**, create a key (starts with `sk-`).
3. Pick a model from **Models** (OpenAI-compatible). Good general choices seen in
   the docs: `deepseek-ai/DeepSeek-V3.1` or a GLM model like `z-ai/glm-5.2`.
4. Put in `.env`:
   ```
   NEAR_AI_BASE_URL=https://cloud-api.near.ai/v1
   NEAR_AI_API_KEY=sk-...
   NEAR_AI_MODEL=deepseek-ai/DeepSeek-V3.1
   ```
It's OpenAI-compatible, so the server uses the standard OpenAI SDK with the base
URL overridden. Bonus for judging: responses carry a hardware-signed proof, which
we surface in the Proof panel. Docs: <https://docs.near.ai/cloud/quickstart/>.

## 3. OutLayer — runs the Game Master in a TEE enclave with a receipt

1. Sign up at <https://app.outlayer.ai> (sign in with a NEAR account — the
   operator above works).
2. Create a project for the Game Master; note the **owner** and **project** names
   (the HTTPS API path is `/call/{owner}/{project}`).
3. Create a **payment key** in the dashboard.
4. Put in `.env`:
   ```
   OUTLAYER_API_KEY=...
   OUTLAYER_BASE_URL=https://testnet-api.outlayer.ai
   OUTLAYER_PROJECT=<owner>/<project>
   ```
Secrets you store in OutLayer (like the NEAR AI key) are decrypted only inside the
enclave and read as env vars by the job. Docs:
<https://app.outlayer.ai/docs/getting-started>. Fallback if this slips: the Game
Master runs on town metrics only and says so (already allowed for in the design).

## 4. Email — magic-link login

Any transactional email provider with a free tier works. Easiest:
- **Resend** (<https://resend.com>) — free tier, simple API. Create an API key and
  verify a sender domain (or use their test sender while developing).
- Alternatives: Postmark, SendGrid, Mailgun.

Put in `.env`:
```
EMAIL_API_KEY=...
EMAIL_FROM=login@yourdomain  # or the provider's test sender while developing
```
Until this is set, local dev can print the magic link to the server console
instead of emailing it.

## 5. Weather API — real-world Game Master events

Free, no card: **Open-Meteo** (<https://open-meteo.com>) needs **no key** at all —
good default. If you prefer OpenWeatherMap (<https://openweathermap.org/api>),
create a free key and set:
```
WEATHER_API_KEY=...
```
A real heatwave/storm in the host's city becomes one in Millbrook; if the feed is
down the Game Master falls back to town metrics.

## 6. Later (M6): domain, VPS, mainnet payout

- **Domain + VPS**: buy a short domain, point an A record at an Ubuntu 24.04 VPS
  (2 CPU / 4 GB), run the Docker Compose stack; Caddy gets HTTPS automatically.
- **Mainnet payout account**: the submission form needs a mainnet `*.near`
  account for the prize. Create it yourself at a wallet; it is **not** used by the
  game and no mainnet key goes in this repo.

---

### Quick check

```
pnpm install
pnpm sim --seed 42 --days 28   # no keys needed — should print a 28-day season
pnpm test                      # 26 economy tests, incl. the 10,000-coin invariant
```
