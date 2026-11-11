import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useSolo } from "../game/SoloProvider";
import { color } from "../theme/tokens";
import { CONTRACT_ID, EXPLORER, readChainAudit } from "../game/chain";
import "./Proof.css";

/**
 * Proof — ported from `design/screenshots/Proof.png`. The left panel is live and
 * true: the town's coins and how they're split always sum to 10,000, read
 * straight from the simulation's ledger. The contract that enforces that total
 * is live on NEAR testnet (`millbrook.testnet`): it is seeded to 10,000, audited
 * on-chain after every settlement, emits a NEP-297 event per move, and anchors a
 * Game Master receipt — all demonstrated on testnet (see the explorer links and
 * the README). The in-browser season is the deterministic sim; the server posts
 * its net daily transfers to that contract.
 */

const SLICES = [
  { key: "residents", label: "Residents", color: color.meadow },
  { key: "workshops", label: "Workshops", color: color.wheat },
  { key: "coop", label: "Town Co-op", color: color.river },
  { key: "townHall", label: "Town Hall", color: color.textSecondary },
] as const;

type ChainState =
  | { status: "loading" }
  | { status: "ok"; auditTotal: number; settlements: number }
  | { status: "offline" };

export function Proof() {
  const { session } = useSolo();
  const h = session.holdings();
  const pct = (n: number) => (h.total > 0 ? (n / h.total) * 100 : 0);
  const gmEvents = session.gmEvents(4);

  // Follow a coin: trace one coin's path; "trace another" picks a different one.
  const [seed, setSeed] = useState(0);
  const trail = session.coinTrail(seed);

  // Read the real audited total from the live contract on testnet, once.
  const [chain, setChain] = useState<ChainState>({ status: "loading" });
  useEffect(() => {
    let alive = true;
    readChainAudit()
      .then((r) => alive && setChain({ status: "ok", ...r }))
      .catch(() => alive && setChain({ status: "offline" }));
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="proof">
      <div className="proof__backdrop" aria-hidden="true">
        <img src="/art/town.svg" alt="" />
      </div>

      <div className="proof__topbar">
        <Link to="/play" className="proof__back">
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
            <path d="M11 3L5 9l6 6" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />
          </svg>
          Back to town
        </Link>
        <span className="proof__note">
          The coin total is enforced by the{" "}
          <a className="proof__link" href={EXPLORER} target="_blank" rel="noreferrer">
            game contract live on NEAR testnet ↗
          </a>
        </span>
      </div>

      <div className="proof__grid">
        {/* ── Live: the town's money ── */}
        <section className="proof__panel proof__money" aria-label="The town's money">
          <h1>The town's money</h1>
          <div className="proof__total">
            <b>{h.total.toLocaleString()}</b>
            <span>coins, always</span>
          </div>
          <p className="proof__lede">
            The game contract refuses any settlement that changes the total. It has no admin key and no way to mint, so
            not even the developer can print money.
          </p>

          <div className="proof__onchain" data-status={chain.status} aria-live="polite">
            <span className="proof__onchain-dot" aria-hidden="true" />
            {chain.status === "loading" && <span>Reading {CONTRACT_ID} on testnet…</span>}
            {chain.status === "ok" && (
              <span>
                On-chain right now:{" "}
                <a className="proof__link" href={EXPLORER} target="_blank" rel="noreferrer">
                  <b>{chain.auditTotal.toLocaleString()}</b> coins audited
                </a>{" "}
                · {chain.settlements} settlement{chain.settlements === 1 ? "" : "s"} so far
              </span>
            )}
            {chain.status === "offline" && (
              <span>
                Testnet unreachable right now — the figure above is the live sim; the{" "}
                <a className="proof__link" href={EXPLORER} target="_blank" rel="noreferrer">
                  contract ↗
                </a>{" "}
                still audits to 10,000 on-chain.
              </span>
            )}
          </div>

          <div>
            <div
              className="proof__bar"
              role="img"
              aria-label={SLICES.map((s) => `${s.label} ${h[s.key]}`).join(", ")}
            >
              {SLICES.map((s) => (
                <span key={s.key} style={{ width: `${pct(h[s.key])}%`, background: s.color }} />
              ))}
            </div>
            <div className="proof__legend">
              {SLICES.map((s) => (
                <span key={s.key}>
                  <span className="proof__legend-key">
                    <span className="proof__chip" style={{ background: s.color }} />
                    {s.label}
                  </span>
                  <b>{h[s.key].toLocaleString()}</b>
                </span>
              ))}
            </div>
          </div>

          <div className="proof__well">
            <div className="proof__well-row">
              <span>Settlement</span>
              <span>Batched each game day; posted to the contract on NEAR testnet</span>
            </div>
            <div className="proof__well-row">
              <span>Contract</span>
              <a className="proof__link" href={EXPLORER} target="_blank" rel="noreferrer">
                {CONTRACT_ID} ↗
              </a>
            </div>
            <div className="proof__well-row">
              <span>Guarantee</span>
              <span>No admin key — no mint, no burn</span>
            </div>
          </div>
        </section>

        <div className="proof__side">
          {/* ── Follow a coin — live from the season's ledger ── */}
          <section className="proof__panel proof__panel--coin" aria-label="Follow a coin">
            <div className="proof__panel-head">
              <h2>Follow a coin</h2>
              <span className="proof__badge proof__badge--live">Live · from the ledger</span>
            </div>
            {trail.hops.length === 0 ? (
              <>
                <p className="proof__lede" style={{ fontSize: 16 }}>
                  Every wage, sale and purchase hands the same coins to the next person in town. Play the season from the
                  town for a few days, then come back — you can trace one coin from hand to hand here.
                </p>
                <div className="proof__coin-empty">No coins have moved yet.</div>
              </>
            ) : (
              <>
                <p className="proof__lede" style={{ fontSize: 15 }}>
                  One coin, handed on {trail.hops.length} time{trail.hops.length === 1 ? "" : "s"} across the town — a wage
                  becomes bread, bread becomes wheat, wheat becomes a farmer's wage. It never leaves Millbrook, so the
                  total never moves off 10,000.
                </p>
                <ol className="proof__trail">
                  {trail.hops.map((hop, i) => (
                    <li className="proof__trail-hop" key={`${hop.day}-${hop.from}-${hop.to}-${i}`}>
                      <span className="proof__trail-dot" aria-hidden="true" />
                      <div className="proof__trail-body">
                        <p className="proof__trail-move">
                          <b>{hop.fromLabel}</b> → <b>{hop.toLabel}</b>
                        </p>
                        <p className="proof__trail-meta">
                          <span className="proof__trail-coins">{hop.amount} coins</span>
                          <span className="proof__trail-reason">{hop.reason}</span>
                          <span className="proof__trail-day">Day {hop.day}</span>
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
                <div className="proof__coin-foot">
                  <button type="button" className="proof__coin-btn" onClick={() => setSeed((n) => n + 1)}>
                    Trace another coin
                  </button>
                  <span className="proof__coin-note">
                    {trail.totalMoves.toLocaleString()} moves recorded this season. Each day's net transfers settle on the{" "}
                    <a className="proof__link" href={EXPLORER} target="_blank" rel="noreferrer">
                      contract ↗
                    </a>
                    .
                  </span>
                </div>
              </>
            )}
          </section>

          {/* ── Game Master receipts — live from the season (M4) ── */}
          <section className="proof__panel proof__panel--receipt" aria-label="Game Master receipt">
            <div className="proof__panel-head sm">
              <h2>Game Master receipt</h2>
              <span className="proof__badge proof__badge--live">Live · testnet</span>
            </div>
            <p className="proof__lede" style={{ fontSize: 15 }}>
              Each event reads a real-world feed (the weather) plus the town's own metrics, picks one event within the
              caps the contract enforces, and the decision is anchored on NEAR testnet via the contract's{" "}
              <code>record_receipt</code>.
            </p>
            {gmEvents.length === 0 ? (
              <div className="proof__receipt-card">
                <span>No events yet</span>
                Run the season from the town — the Game Master fires at most one event a game week.
              </div>
            ) : (
              <ul className="proof__gm-list">
                {gmEvents.map((e) => (
                  <li key={`${e.day}-${e.id}`} className="proof__gm-item">
                    <div className="proof__gm-head">
                      <b>{e.title}</b>
                      <span className={`proof__gm-src proof__gm-src--${e.source}`}>
                        {e.source === "feed" ? "weather feed" : "town metrics"}
                      </span>
                      <span className="proof__gm-day">Day {e.day}</span>
                    </div>
                    <p className="proof__gm-why">{e.reason}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
