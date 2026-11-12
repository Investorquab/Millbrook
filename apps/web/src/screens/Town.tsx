import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { PRICE_MAX, PRICE_MIN, WAGE_MAX, WAGE_MIN, type FeedLine } from "@millbrook/economy";
import { useSolo } from "../game/SoloProvider";
import { useTutorial } from "../game/useTutorial";
import { TutorialCard } from "../components/Tutorial";
import { faceFor } from "../game/faces";
import { isMuted, playClick, playCoin, playEvent, toggleMuted } from "../game/sound";
import "./Town.css";

// The 3D town pulls in three.js (~1 MB); load it only on this screen so the
// Title/SignIn/Hub stay light.
const TownScene = lazy(() => import("../town3d/TownScene").then((m) => ({ default: m.TownScene })));

/**
 * In the town — the main HUD, ported from `design/screenshots/Town.png` and
 * now driven by a live solo season from `@millbrook/economy` (via
 * {@link useSoloSession}). The steppers, stats, coins, unemployment, mood and
 * feed all reflect the real simulation; press play to advance the days.
 *
 * The town is now the live R3F diorama ({@link TownScene}) — a low-poly mill
 * town at dusk whose shops react to the simulation. The Game Master decision
 * card is a scripted placeholder until M4. Design fix applied: Ada's bubble is
 * kept clear of the feed.
 */

const CoinIcon = () => (
  <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
    <circle cx="11" cy="11" r="9" fill="#D9A441" />
    <circle cx="11" cy="11" r="5.5" fill="none" stroke="#a8761f" strokeWidth="1.6" />
  </svg>
);

const moodColor: Record<string, string> = {
  Content: "var(--meadow-text)",
  Uneasy: "var(--wheat-light)",
  Strained: "var(--madder-text)",
};

/** A small icon for a feed line, chosen by event kind. */
function FeedIcon({ kind }: { kind: string }) {
  if (kind === "strike_start" || kind === "bankruptcy" || kind === "layoff" || kind === "theft" || kind === "fire") {
    return (
      <span className="town__feed-icon" style={{ background: "var(--madder)" }}>
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
          <path d="M7 1l6 11H1z" fill="#fff" />
        </svg>
      </span>
    );
  }
  if (kind === "phase_change" || kind === "gm_event" || kind === "election") {
    return (
      <span
        className="town__feed-icon"
        style={{ background: "#E8E1D0", fontFamily: "var(--font-display)", fontWeight: 700, color: "#2F3640" }}
      >
        G
      </span>
    );
  }
  if (kind === "hire" || kind === "job_change" || kind === "migration_in" || kind === "auction" || kind === "birth") {
    return (
      <span className="town__feed-icon" style={{ background: "var(--river)" }}>
        <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="8" cy="5" r="3" fill="#1E242B" />
          <path d="M2.5 14a5.5 5.5 0 0 1 11 0z" fill="#1E242B" />
        </svg>
      </span>
    );
  }
  return (
    <span className="town__feed-icon" style={{ background: "var(--inset)" }}>
      <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true">
        <circle cx="4" cy="4" r="3" fill="#B9B2A4" />
      </svg>
    </span>
  );
}

/** A short, readable line for one key of the data the Game Master read. */
function dataLine(key: string, value: string | number): string | null {
  const map: Record<string, (v: string | number) => string> = {
    unemployment: (v) => `Unemployment ${(Number(v) * 100).toFixed(0)}%`,
    avgWage: (v) => `Average wage ${Number(v).toFixed(1)}`,
    wheatPrice: (v) => `Wheat price ${v}`,
    tempC: (v) => `${v}°C`,
    weather: (v) => `Sky: ${v}`,
    leaderCoins: (v) => `Leader holds ${v} coins`,
    days: (v) => `Lasts ${v} day${Number(v) === 1 ? "" : "s"}`,
    arrivals: (v) => `${v} newcomers`,
    taxed: (v) => `${v} coins moved to the Co-op`,
  };
  return map[key] ? map[key]!(value) : null;
}

export function Town() {
  const { view, session, running, play, pause, setPrice, setWage, setInsured, hire, takeOverAuction, passAuction } =
    useSolo();
  const [tab, setTab] = useState<"town" | "chat">("town");
  const [whyOpen, setWhyOpen] = useState(false);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [foremanOpen, setForemanOpen] = useState(false);
  const [orders, setOrders] = useState(() => session.foremanOrders());
  const [muted, setMutedState] = useState(isMuted);

  // Guided first session — points at the live control for each step.
  const tour = useTutorial(view, running);

  // The Foreman runs these standing orders for you each dawn (plain code).
  const setOrder = (partial: Partial<typeof orders>) => {
    session.setForemanOrders(partial);
    setOrders(session.foremanOrders());
  };

  // The latest Game Master event, straight from the live season (M4).
  const gm = session.gmEvents(1)[0];
  const gmKey = gm ? `${gm.day}-${gm.id}` : null;
  const showGm = gm && dismissed !== gmKey;

  // A failed rival's premises up for auction — the player may bid to take over.
  const auction = session.auctionOffers()[0];

  // ── Sound cues (synthesized; silent when muted) ──
  // A coin chime on each day the bakery sells (deduped by day).
  const lastChimeDay = useRef(0);
  useEffect(() => {
    if (view.soldToday > 0 && view.day !== lastChimeDay.current) {
      lastChimeDay.current = view.day;
      playCoin();
    }
  }, [view.day, view.soldToday]);
  // A soft cue when a new Game Master event fires (not on first mount).
  const prevGmKey = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (prevGmKey.current !== undefined && gmKey && gmKey !== prevGmKey.current) playEvent();
    prevGmKey.current = gmKey;
  }, [gmKey]);

  const deltaLabel =
    view.coinsDelta === 0 ? "even today" : `${view.coinsDelta > 0 ? "+" : "−"}${Math.abs(view.coinsDelta)} today`;

  return (
    <div className="town" data-tour={tour.target ?? undefined}>
      <TutorialCard tour={tour} />
      <div className="town__scene" aria-hidden="true">
        <Suspense fallback={<div className="town__scene-loading" />}>
          <TownScene />
        </Suspense>
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
          Day {view.day} of {view.totalDays} · {view.phaseLabel}
        </span>
        <div className="town__speed" role="group" aria-label="Game speed">
          <button type="button" aria-label="Pause" aria-pressed={!running} onClick={pause}>
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
              <path d="M3 2h3v10H3zM8 2h3v10H8z" fill={!running ? "#2F3640" : "#EDE6D6"} />
            </svg>
          </button>
          <button
            type="button"
            aria-label="Play"
            aria-pressed={running}
            onClick={() => {
              playClick();
              play();
            }}
            disabled={view.ended}
            data-tour-target="play"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
              <path d="M3 2l9 5-9 5z" fill={running ? "#2F3640" : "#EDE6D6"} />
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
          <span className="town__coins-value">{view.coins.toLocaleString()}</span>
          <span
            className="town__coins-delta"
            style={{ color: view.coinsDelta >= 0 ? "var(--meadow-text)" : "var(--madder-text)" }}
          >
            {deltaLabel}
          </span>
        </span>
        <span className="town__divider" />
        <span className="town__stat">
          <span className="town__stat-label">Unemployment</span>
          <span
            className="town__stat-value"
            style={{ color: view.unemploymentPct >= 15 ? "var(--madder-text)" : "var(--text-soft)" }}
          >
            {view.unemploymentPct}%
            {view.unemploymentRising && (
              <svg width="10" height="10" viewBox="0 0 10 10" aria-label="rising">
                <path d="M5 1l4 7H1z" fill="#E58A94" />
              </svg>
            )}
          </span>
        </span>
        <span className="town__stat">
          <span className="town__stat-label">Town mood</span>
          <span className="town__stat-value" style={{ color: moodColor[view.mood] ?? "var(--linen)" }}>
            {view.mood}
          </span>
        </span>
        <span className="town__divider" />
        <button
          type="button"
          className="town__pill town__mute"
          aria-label={muted ? "Unmute sound" : "Mute sound"}
          aria-pressed={muted}
          onClick={() => setMutedState(toggleMuted())}
        >
          {muted ? (
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
              <path d="M2 7h3l4-3v10l-4-3H2z" fill="currentColor" />
              <path d="M12 6l4 6M16 6l-4 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
              <path d="M2 7h3l4-3v10l-4-3H2z" fill="currentColor" />
              <path d="M12 6a4 4 0 0 1 0 6M14 4a7 7 0 0 1 0 10" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" />
            </svg>
          )}
        </button>
        <Link to="/market" className="town__pill">
          Market
        </Link>
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
          <span className="town__bubble-body">Tap a resident to see why they chose as they did</span>
        </Link>
        {view.onStrike && (
          <span className="town__strike">
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
              <path d="M7 1l6 11H1z" fill="none" stroke="#fff" strokeWidth="1.6" />
              <path d="M7 5v3.5M7 10v.5" stroke="#fff" strokeWidth="1.6" />
            </svg>
            Your bakery is on strike
          </span>
        )}
      </div>

      {/* ── Bottom HUD ── */}
      <div className="town__hud">
        {/* Workshop */}
        <section className="town__workshop" aria-label="Your bakery">
          <div className="town__workshop-head">
            <h2>Your bakery</h2>
            <div className="town__crew">
              {view.workers.length === 0 ? (
                <span className="town__reason" style={{ alignSelf: "center" }}>
                  No bakers yet
                </span>
              ) : (
                view.workers.slice(0, 5).map((worker) => {
                  const face = faceFor(worker.name);
                  return face.src ? (
                    <img key={worker.id} src={face.src} alt={worker.name} title={worker.name} />
                  ) : (
                    <span
                      key={worker.id}
                      title={worker.name}
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: "50%",
                        border: "2px solid var(--millstone)",
                        background: face.color,
                        color: "#1E242B",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: 700,
                        fontSize: 15,
                        marginLeft: -8,
                      }}
                    >
                      {face.initial}
                    </span>
                  );
                })
              )}
            </div>
          </div>

          <div className="town__control">
            <div className="town__control-row">
              <span>Bread price</span>
              <div className="town__stepper" data-tour-target="price">
                <button
                  type="button"
                  aria-label="Lower the bread price"
                  onClick={() => setPrice(view.price - 1)}
                  disabled={view.price <= PRICE_MIN}
                >
                  −
                </button>
                <span className="town__stepper-value">{view.price} coins</span>
                <button
                  type="button"
                  aria-label="Raise the bread price"
                  onClick={() => setPrice(view.price + 1)}
                  disabled={view.price >= PRICE_MAX}
                >
                  +
                </button>
              </div>
            </div>
            <span className="town__reason">{view.priceReason}</span>
          </div>

          <div className="town__control">
            <div className="town__control-row">
              <span>Wage</span>
              <div className="town__stepper">
                <button
                  type="button"
                  aria-label="Lower the wage"
                  onClick={() => setWage(view.wage - 1)}
                  disabled={view.wage <= WAGE_MIN}
                >
                  −
                </button>
                <span className="town__stepper-value">{view.wage} a day</span>
                <button
                  type="button"
                  aria-label="Raise the wage"
                  onClick={() => setWage(view.wage + 1)}
                  disabled={view.wage >= WAGE_MAX}
                >
                  +
                </button>
              </div>
            </div>
            <span className="town__reason">{view.wageReason}</span>
          </div>

          <div className="town__stats">
            <span>
              <span className="town__stats-label">Stock</span>
              <b>{view.stock} loaves</b>
            </span>
            <span>
              <span className="town__stats-label">Sold today</span>
              <b>{view.soldToday} loaves</b>
            </span>
            <span>
              <span className="town__stats-label">Profit today</span>
              <b style={{ color: view.profitToday >= 0 ? "var(--meadow-text)" : "var(--madder-text)" }}>
                {view.profitToday >= 0 ? "+" : "−"}
                {Math.abs(view.profitToday)}
              </b>
            </span>
          </div>

          <div className="town__workshop-actions">
            <button
              type="button"
              className="town__btn-solid"
              onClick={() => {
                playClick();
                hire();
              }}
              disabled={!view.canHire}
              data-tour-target="hire"
            >
              {view.canHire ? "Hire a baker" : "Bakery is full"}
            </button>
            <button
              type="button"
              className="town__btn-ghost"
              aria-expanded={foremanOpen}
              onClick={() => setForemanOpen((o) => !o)}
            >
              Foreman's orders
            </button>
          </div>

          {foremanOpen && (
            <section className="town__foreman" aria-label="Foreman's standing orders">
              <p className="town__foreman-intro">
                Your Foreman runs these in plain code each dawn, so you don't have to watch every day.
              </p>
              <label className="town__foreman-row">
                <input
                  type="checkbox"
                  checked={orders.matchWages}
                  onChange={(e) => setOrder({ matchWages: e.target.checked })}
                />
                <span>
                  Match rival wages to keep my workers
                  <small>up to a cap, so no one poaches your bakers</small>
                </span>
              </label>
              {orders.matchWages && (
                <div className="town__foreman-cap">
                  <span>Wage cap</span>
                  <div className="town__stepper">
                    <button
                      type="button"
                      aria-label="Lower the wage cap"
                      onClick={() => setOrder({ wageCap: orders.wageCap - 1 })}
                      disabled={orders.wageCap <= WAGE_MIN}
                    >
                      −
                    </button>
                    <span className="town__stepper-value">{orders.wageCap} a day</span>
                    <button
                      type="button"
                      aria-label="Raise the wage cap"
                      onClick={() => setOrder({ wageCap: orders.wageCap + 1 })}
                      disabled={orders.wageCap >= WAGE_MAX}
                    >
                      +
                    </button>
                  </div>
                </div>
              )}
              <label className="town__foreman-row">
                <input
                  type="checkbox"
                  checked={orders.autoHire}
                  onChange={(e) => setOrder({ autoHire: e.target.checked })}
                />
                <span>
                  Hire when demand for bread goes unmet
                  <small>only while the wages are covered</small>
                </span>
              </label>
              <label className="town__foreman-row">
                <input
                  type="checkbox"
                  checked={view.insured}
                  onChange={(e) => {
                    playClick();
                    setInsured(e.target.checked);
                  }}
                />
                <span>
                  Insure the bakery against fire
                  <small>a small daily premium; the Co-op pool pays out if it burns</small>
                </span>
              </label>
              {view.foremanNote && <p className="town__foreman-note">“{view.foremanNote}”</p>}
            </section>
          )}
        </section>

        {/* Bankruptcy auction — a failed rival's premises are up for grabs. The
            player can stake coins to take them over and run a second shop, or
            let an AI buyer have them. */}
        {auction && (
          <section className="town__decision town__decision--auction" aria-label="Auction">
            <div className="town__decision-head">
              <span className="town__decision-source">
                <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M3 13h10M5 11l3-3M8 8l3 3M8 2l3 3-3 3-3-3z" stroke="#D9A441" strokeWidth="1.4" fill="none" />
                </svg>
                Up for auction
              </span>
            </div>
            <h2>
              {auction.formerOwner}'s {auction.type} is up for auction. Take over the premises for {auction.bid} coins?
            </h2>
            <p>
              Stake {auction.bid} coins from your till and you'll run the {auction.type} too — another shop, another
              market. The failed owner's estate goes to the Town Hall, so the town's 10,000 coins stay in town.
            </p>
            <div className="town__decision-actions">
              <button
                type="button"
                className="town__decide-primary"
                disabled={!auction.affordable}
                onClick={() => {
                  if (auction.affordable) {
                    playClick();
                    takeOverAuction(auction.workshopId);
                  }
                }}
              >
                {auction.affordable ? `Take it over (${auction.bid})` : `Need ${auction.bid} coins`}
              </button>
              <button
                type="button"
                className="town__decide-ghost"
                onClick={() => {
                  playClick();
                  passAuction(auction.workshopId);
                }}
              >
                Let it go
              </button>
            </div>
          </section>
        )}

        {/* Game Master event card — live from the season (M4). It shows the most
            recent event, its real reasoning and the data it read; "Why did this
            happen?" opens the proof, and the receipt is anchored on NEAR. */}
        {showGm ? (
          <section className="town__decision" aria-label="Game Master">
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
                {gm.source === "feed" ? "From the Game Master · real weather feed" : "From the Game Master · town metrics"}
              </span>
              <span className="town__decision-deadline">
                Day {gm.day}
                {gm.active ? " · in effect" : ""}
              </span>
            </div>
            <h2>
              {gm.title}. {gm.effect}
            </h2>
            {whyOpen ? (
              <div className="town__why-panel" data-testid="gm-why-panel">
                <p>{gm.reason}</p>
                <ul className="town__why-data">
                  {Object.entries(gm.data)
                    .map(([k, v]) => dataLine(k, v))
                    .filter((l): l is string => l !== null)
                    .slice(0, 5)
                    .map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                </ul>
              </div>
            ) : (
              <p>The Game Master read the town and acted within the catalog's caps.</p>
            )}
            <div className="town__decision-actions">
              <button
                type="button"
                className="town__decide-primary"
                aria-expanded={whyOpen}
                onClick={() => setWhyOpen((o) => !o)}
              >
                {whyOpen ? "Hide the reasoning" : "Why did this happen?"}
              </button>
              <button type="button" className="town__decide-ghost" onClick={() => setDismissed(gmKey)}>
                Got it
              </button>
              <Link to="/proof" className="town__why">
                See the receipt
              </Link>
            </div>
          </section>
        ) : (
          <section className="town__decision town__decision--idle" aria-label="Game Master">
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
                The Game Master
              </span>
            </div>
            <h2>Watching the weather and the town.</h2>
            <p>Events appear here as the season runs — at most one a week, each within the caps the contract enforces.</p>
            <div className="town__decision-actions">
              <Link to="/proof" className="town__why">
                How the Game Master proves itself
              </Link>
            </div>
          </section>
        )}

        {/* Feed + chat */}
        <aside className="town__feed" aria-label="Town feed and chat">
          <div className="town__tabs" role="tablist">
            <button type="button" role="tab" aria-selected={tab === "town"} onClick={() => setTab("town")}>
              Town
            </button>
            <button type="button" role="tab" aria-selected={tab === "chat"} onClick={() => setTab("chat")}>
              Chat
            </button>
          </div>

          {tab === "town" ? (
            <div className="town__feed-list">
              {view.feed.length === 0 ? (
                <p className="town__chat-empty">
                  The town is waking up. Press play to run the season and watch the news roll in.
                </p>
              ) : (
                view.feed.map((line: FeedLine, i: number) => (
                  <div className="town__feed-item" key={`${line.day}-${i}`}>
                    <FeedIcon kind={line.kind} />
                    <span>
                      {line.text} <span className="town__feed-time">Day {line.day}</span>
                    </span>
                  </div>
                ))
              )}
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
