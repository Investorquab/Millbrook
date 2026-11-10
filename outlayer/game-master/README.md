# Game Master (OutLayer enclave job)

The Game Master decides Millbrook's world events. It is meant to run inside an
[OutLayer](https://app.outlayer.ai) TEE enclave, so every event ships with a
receipt proving which code ran, on which data, and what it decided.

```
town snapshot ─┐
weather feed ──┼─▶ eligible, already-capped candidates (pure)
               │        └─▶ NEAR AI Cloud picks one + explains   (fallback: deterministic pick + template)
               └─▶ receipt (TEE attestation; sha256 over inputs + decision)
```

## Why the caps are safe

The hard caps (a price at most 3×, at most 5 days, one event per game week, one
Phase-3 shock) come from the catalog in `@millbrook/shared` and are applied by
`candidates.ts` **before** any model is called. The AI only ever *chooses among*
candidates the pure code already built and capped — it cannot invent an event or
widen an effect. The server re-applies the same capped parameters when it runs
the effect, and the contract keeps the 10,000-coin total regardless. The unit
tests include a hostile model that tries to smuggle a `durationDays: 9999`; the
job ignores it and uses the capped candidate.

## Fallbacks (nothing here needs a key to run)

- **No weather feed?** Open-Meteo is keyless, but if it is unreachable the job
  returns a `fallback` reading and runs on town metrics, saying so in the
  decision, the `notes`, and the receipt's `feedSource`.
- **No NEAR AI key?** It makes a deterministic pick and writes a template
  paragraph, marked `reasoningSource: "fallback"` and `enclave: "local-fallback"`.

## The receipt

`receipt.ts` hashes the canonical inputs and the decision with sha256, so anyone
can recompute and verify them. In a real enclave the `attestation` is a hardware
quote; the local fallback marks itself unattested. `scripts/post-receipt.ts`
anchors the `receiptHash` on NEAR testnet via the contract's `record_receipt`,
which emits an on-chain event for the Proof panel.

## Run it

```bash
pnpm --filter @millbrook/game-master gm                       # sample town, prints decision + receipt
pnpm --filter @millbrook/game-master gm -- --unemployment 0.25 --day 20
pnpm --filter @millbrook/game-master test
pnpm tsx scripts/post-receipt.ts                              # run + anchor on testnet
```

Set `NEAR_AI_API_KEY`, `NEAR_AI_BASE_URL` and `NEAR_AI_MODEL` in `.env` for live
reasoning; leave them empty for the fallback. See `docs/SETUP.md`.

## Relationship to the simulation

`@millbrook/economy` carries an in-process copy of the same capped catalog so the
solo game can run offline and deterministically (`runGameMaster`). This package
is the production, attested path the server (M5) calls once per game day.
