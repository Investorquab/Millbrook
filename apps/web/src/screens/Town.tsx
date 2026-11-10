import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import "./Town.css";

/**
 * In the town — the main HUD, ported from `design/screenshots/Town.png` with
 * the stepper and decision-card logic from `design/screens/Town.dc.html`.
 *
 * The town is the hero (SVG stand-in until the R3F scene lands in M2). The
 * numbers here follow the design's placeholder formulas; M2 wires them to the
 * `@millbrook/economy` engine. Design fix applied: Ada's speech bubble is kept
 * clear of the feed panel.
 */

type FeedTab = "town" | "chat";
type Decided = null | "lock" | "wait";

const CoinIcon = () => (
  <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
    <circle cx="11" cy="11" r="9" fill="#D9A441" />
    <circle cx="11" cy="11" r="5.5" fill="none" stroke="#a8761f" strokeWidth="1.6" />
  </svg>
);

export function Town() {
  const [price, setPrice] = useState(3);
  const [wage, setWage] = useState(8);
  const [decided, setDecided] = useState<Decided>(null);
  const [tab, setTab] = useState<FeedTab>("town");

  // Design placeholder model (Town.dc.html) — replaced by the economy engine
  // when the HUD is wired to the simulation.
  const { priceReason, wageReason, sold, profit, profitColor } = useMemo(() => {
    const priceReason =
      price <= 2
        ? "Cheapest in town, but you lose a coin on every loaf."
        : price === 3
          ? "Same as Gus. Most residents can afford it."
          : price === 4
            ? "Above Gus. Thrifty residents will shop there instead."
            : "Only well-paid residents will buy at this price.";
    const wageReason =
      wage < 7
        ? "Below the town average of 7.4. Your workers may strike in 5 days."
        : wage <= 8
          ? "Around the town average of 7.4."
          : "Above average. Better applicants, thinner margins.";
    const sold = Math.max(0, 40 - (price - 3) * 9 + (wage - 8) * 2);
    const profit = sold * price - 3 * wage - sold;
    return {
      priceReason,
      wageReason,
      sold,
      profit,
      profitColor: profit >= 0 ? "var(--meadow-text)" : "var(--madder-text)",
    };
  }, [price, wage]);

  const toast =
    decided === "lock"
      ? "Wheat locked in at today's price for 5 days."
      : "You'll buy wheat at drought prices. Watch your margins.";

  return (
    <div className="town">
      <div className="town__scene" aria-hidden="true">
        <img
          src="/art/town.svg"
          alt="The town at dusk. Coins fly from a resident to your bakery; smoke rises from the smithy."
        />
      </div>

      {/* ── Top bar ── */}
      <header className="town__topbar">
        <Link to="/hub" className="town__brand">
          Millbrook
        </Link>
        <span className="town__clock">
          <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
            <path d="M2 15h18" stroke="#B9B2A4" strokeWidth="1.6" />
            <path d="M5 15a6 6 0 0 1 12 0" fill="#E0703A" />
          </svg>
          Day 12 of 28, dusk
        </span>
        <div className="town__speed" role="group" aria-label="Game speed">
          <button type="button" aria-label="Pause">
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
              <path d="M3 2h3v10H3zM8 2h3v10H8z" fill="#EDE6D6" />
            </svg>
          </button>
          <button type="button" aria-label="Normal speed" aria-pressed="true">
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
              <path d="M3 2l9 5-9 5z" fill="#2F3640" />
            </svg>
          </button>
          <Link to="/fast-forward" aria-label="Fast-forward a week">
            <svg width="18" height="14" viewBox="0 0 18 14" aria-hidden="true">
              <path d="M1 2l7 5-7 5zM9 2l7 5-7 5z" fill="#EDE6D6" />
            </svg>
          </Link>
        </div>

        <div className="town__spacer" />

        <span className="town__coins">
          <CoinIcon />
          <span className="town__coins-value">1,240</span>
          <span className="town__coins-delta">+46 today</span>
        </span>
        <span className="town__divider" />
        <span className="town__stat">
          <span className="town__stat-label">Unemployment</span>
          <span className="town__stat-value" style={{ color: "var(--madder-text)" }}>
            14%
            <svg width="10" height="10" viewBox="0 0 10 10" aria-label="rising">
              <path d="M5 1l4 7H1z" fill="#E58A94" />
            </svg>
          </span>
        </span>
        <span className="town__stat">
          <span className="town__stat-label">Town mood</span>
          <span className="town__stat-value" style={{ color: "var(--wheat-light)" }}>
            Uneasy
          </span>
        </span>
        <span className="town__divider" />
        <Link to="/gazette" className="town__pill">
          Gazette
        </Link>
        <Link to="/proof" className="town__pill town__pill--proof">
          Proof
        </Link>
      </header>

      {/* ── Floating world overlays ── */}
      <div className="town__overlays">
        <Link to="/resident" className="town__bubble">
          <svg className="town__bubble-tail" width="18" height="11" viewBox="0 0 18 11" aria-hidden="true">
            <path d="M0 11h18L9 0z" fill="#EDE6D6" />
          </svg>
          <span className="town__bubble-body">Ada: bought bread with yesterday's wage</span>
        </Link>
        <span className="town__coinbadge">+3 coins</span>
        <span className="town__strike">
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <path d="M7 1l6 11H1z" fill="none" stroke="#fff" strokeWidth="1.6" />
            <path d="M7 5v3.5M7 10v.5" stroke="#fff" strokeWidth="1.6" />
          </svg>
          Smithy strike likely tomorrow
        </span>
      </div>

      {/* ── Bottom HUD ── */}
      <div className="town__hud">
        {/* Workshop */}
        <section className="town__workshop" aria-label="Your bakery">
          <div className="town__workshop-head">
            <h2>Your bakery</h2>
            <div className="town__crew">
              <img src="/art/face-ada.svg" alt="Ada" />
              <img src="/art/face-tom.svg" alt="Tom" />
              <img src="/art/face-mara.svg" alt="Mara" />
            </div>
          </div>

          <div className="town__control">
            <div className="town__control-row">
              <span>Bread price</span>
              <div className="town__stepper">
                <button
                  type="button"
                  aria-label="Lower the bread price"
                  onClick={() => setPrice((p) => Math.max(1, p - 1))}
                  disabled={price <= 1}
                >
                  −
                </button>
                <span className="town__stepper-value">{price} coins</span>
                <button
                  type="button"
                  aria-label="Raise the bread price"
                  onClick={() => setPrice((p) => Math.min(6, p + 1))}
                  disabled={price >= 6}
                >
                  +
                </button>
              </div>
            </div>
            <span className="town__reason">{priceReason}</span>
          </div>

          <div className="town__control">
            <div className="town__control-row">
              <span>Wage</span>
              <div className="town__stepper">
                <button
                  type="button"
                  aria-label="Lower the wage"
                  onClick={() => setWage((w) => Math.max(5, w - 1))}
                  disabled={wage <= 5}
                >
                  −
                </button>
                <span className="town__stepper-value">{wage} a day</span>
                <button
                  type="button"
                  aria-label="Raise the wage"
                  onClick={() => setWage((w) => Math.min(12, w + 1))}
                  disabled={wage >= 12}
                >
                  +
                </button>
              </div>
            </div>
            <span className="town__reason">{wageReason}</span>
          </div>

          <div className="town__stats">
            <span>
              <span className="town__stats-label">Stock</span>
              <b>42 loaves</b>
            </span>
            <span>
              <span className="town__stats-label">Sold today</span>
              <b>{sold} loaves</b>
            </span>
            <span>
              <span className="town__stats-label">Profit today</span>
              <b style={{ color: profitColor }}>
                {profit >= 0 ? "+" : ""}
                {profit}
              </b>
            </span>
          </div>

          <div className="town__workshop-actions">
            <button type="button" className="town__btn-solid">
              Hire a baker
            </button>
            <button type="button" className="town__btn-ghost">
              Foreman's orders
            </button>
          </div>
        </section>

        {/* Decision card → toast once resolved */}
        {decided === null ? (
          <section className="town__decision" aria-label="Decision">
            <div className="town__decision-head">
              <span className="town__decision-source">
                <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                  <circle cx="8" cy="8" r="4" fill="#E0703A" />
                  <path
                    d="M8 0v2M8 14v2M0 8h2M14 8h2M2.3 2.3l1.4 1.4M12.3 12.3l1.4 1.4M2.3 13.7l1.4-1.4M12.3 3.7l1.4-1.4"
                    stroke="#E0703A"
                    strokeWidth="1.4"
                  />
                </svg>
                From the Game Master, based on real weather
              </span>
              <span className="town__decision-deadline">Decide by dawn</span>
            </div>
            <h2>Drought. Wheat costs three times as much for 5 days.</h2>
            <p>
              A real heatwave in the host's city reached Millbrook. The Co-op can sell you a 5-day wheat contract at
              today's price.
            </p>
            <div className="town__decision-actions">
              <button type="button" className="town__decide-primary" onClick={() => setDecided("lock")}>
                Lock in wheat for 240 coins
              </button>
              <button type="button" className="town__decide-ghost" onClick={() => setDecided("wait")}>
                Wait it out
              </button>
              <Link to="/proof" className="town__why">
                Why did this happen?
              </Link>
            </div>
          </section>
        ) : (
          <section className="town__toast" aria-live="polite">
            <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
              <circle cx="11" cy="11" r="9" fill="#6E9B5A" />
              <path d="M7 11l3 3 5-6" stroke="#1E242B" strokeWidth="2.2" fill="none" />
            </svg>
            {toast}
            <Link to="/proof">Why did this happen?</Link>
          </section>
        )}

        {/* Feed + chat */}
        <aside className="town__feed" aria-label="Town feed and chat">
          <div className="town__tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={tab === "town"}
              onClick={() => setTab("town")}
            >
              Town
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "chat"}
              onClick={() => setTab("chat")}
            >
              Chat (2)
            </button>
          </div>

          {tab === "town" ? (
            <div className="town__feed-list">
              <div className="town__feed-item">
                <img src="/art/face-gus.svg" alt="Gus" />
                <span>
                  <b>Gus</b> cut smithy wages to 6. <span className="town__feed-time">Day 12, noon</span>
                </span>
              </div>
              <div className="town__feed-item">
                <img src="/art/face-tom.svg" alt="Tom" />
                <span>
                  <b>Tom</b> left the weaver for your bakery: 2 coins more a day.{" "}
                  <span className="town__feed-time">Day 12, dawn</span>
                </span>
              </div>
              <div className="town__feed-item">
                <span className="town__feed-icon" style={{ background: "var(--madder)" }}>
                  <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                    <path d="M7 1l6 11H1z" fill="#fff" />
                  </svg>
                </span>
                <span>
                  Smithy workers underpaid for 4 days. They strike tomorrow unless Gus pays the town average.{" "}
                  <span className="town__feed-time">Day 11, dusk</span>
                </span>
              </div>
              <div className="town__feed-item">
                <span
                  className="town__feed-icon"
                  style={{
                    background: "#E8E1D0",
                    fontFamily: "var(--font-display)",
                    fontWeight: 700,
                    color: "#2F3640",
                  }}
                >
                  G
                </span>
                <span>
                  The Gazette is out: "Wage war at the smithy."{" "}
                  <Link to="/gazette" style={{ fontWeight: 600 }}>
                    Read it
                  </Link>
                </span>
              </div>
              <div className="town__feed-item">
                <img src="/art/face-fern.svg" alt="Fern" />
                <span>
                  <b>Fern</b> offers 30 cloth for 75 coins.{" "}
                  <button type="button" className="town__feed-linkbtn">
                    See offer
                  </button>
                </span>
              </div>
            </div>
          ) : (
            <div className="town__feed-list">
              <p className="town__chat-empty">
                Chat opens in rooms. Host or join a town to trade and talk with other players.
              </p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
