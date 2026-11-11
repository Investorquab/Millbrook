import { Link } from "react-router-dom";
import { useSolo } from "../game/SoloProvider";
import { color } from "../theme/tokens";
import "./Proof.css";

/**
 * Proof — ported from `design/screenshots/Proof.png`. The left panel is live and
 * true right now: the town's coins and how they're split always sum to 10,000,
 * read straight from the simulation's ledger. The per-coin trace, the settlement
 * links and the Game Master receipt depend on the on-chain settlement (M3) and
 * the Game Master (M4), so they're shown here as what's coming, clearly marked —
 * the README keeps those under Roadmap until they run.
 */

const SLICES = [
  { key: "residents", label: "Residents", color: color.meadow },
  { key: "workshops", label: "Workshops", color: color.wheat },
  { key: "coop", label: "Town Co-op", color: color.river },
  { key: "townHall", label: "Town Hall", color: color.textSecondary },
] as const;

export function Proof() {
  const { session } = useSolo();
  const h = session.holdings();
  const pct = (n: number) => (h.total > 0 ? (n / h.total) * 100 : 0);
  const gmEvents = session.gmEvents(4);

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
        <span className="proof__note">The coin total is enforced by the game contract on NEAR testnet</span>
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
              <span>Batched each game day at dusk — on testnet in M3</span>
            </div>
            <div className="proof__well-row">
              <span>Contract</span>
              <span>NEP-245 items + coins, no admin key</span>
            </div>
          </div>
        </section>

        <div className="proof__side">
          {/* ── Follow a coin (lands with on-chain settlement, M3) ── */}
          <section className="proof__panel proof__panel--soon" aria-label="Follow a coin">
            <div className="proof__panel-head">
              <h2>Follow a coin</h2>
              <span className="proof__badge">With settlement · M3</span>
            </div>
            <p className="proof__lede" style={{ fontSize: 16 }}>
              Every wage, sale and purchase already moves coins between the same accounts the contract will settle. Once
              the daily batch posts to NEAR testnet, this traces one coin's path — wage to bread to wheat to farm wage —
              each hop a real transaction you can open on the explorer.
            </p>
            <div className="proof__steps" aria-hidden="true">
              <div className="proof__step">
                <span className="proof__step-dot" />
                <p>Your bakery pays a baker their wage.</p>
              </div>
              <div className="proof__step">
                <span className="proof__step-dot" />
                <p>They spend it on bread at your counter.</p>
              </div>
              <div className="proof__step">
                <span className="proof__step-dot" />
                <p>You pay it to the Co-op for wheat — still in town, still 10,000.</p>
              </div>
            </div>
          </section>

          {/* ── Game Master receipts — live from the season (M4) ── */}
          <section className="proof__panel proof__panel--receipt" aria-label="Game Master receipt">
            <div className="proof__panel-head sm">
              <h2>Game Master receipt</h2>
              <span className="proof__badge proof__badge--live">Live · M4</span>
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
