import { Link } from "react-router-dom";
import type { FeedLine } from "@millbrook/economy";
import { useSolo } from "../game/SoloProvider";
import "./Market.css";

/**
 * The Market — the whole living town at a glance, not just your bakery. Every
 * workshop (yours and the three AI rivals) shows its owner, strategy, price,
 * wage, crew, stock, sales, profit and standing, live as the season runs; the
 * Co-op and Town Hall show the public purse; and the transaction stream shows
 * the wages, sales, hirings and moves happening across all thirty residents.
 *
 * All of it reads data the engine already exposes (`view(workshopId)`,
 * `standings()`, `holdings()`), so it stays in lockstep with the simulation and
 * the on-chain ledger — the town's 10,000 coins, split across everyone.
 */

const GOODS: Record<string, { good: string; color: string }> = {
  bakery: { good: "Bread", color: "#d9a441" },
  weaver: { good: "Cloth", color: "#5e8c93" },
  smithy: { good: "Tools", color: "#b23a48" },
  brewery: { good: "Ale", color: "#8a6f3a" },
  tailor: { good: "Clothes", color: "#7a6f9c" },
  tavern: { good: "Meals", color: "#b07d3a" },
  apothecary: { good: "Remedies", color: "#5fa36a" },
};

const STRATEGY: Record<string, { label: string; color: string; blurb: string }> = {
  gus: { label: "Greedy", color: "#e58a94", blurb: "Pays the minimum, undercuts on price, lays off fast." },
  fern: { label: "Fair", color: "#8fc07a", blurb: "Pays above average, steady prices, keeps loyal workers." },
  sam: { label: "Steady", color: "#8fb8c0", blurb: "Copies the town average — a calm benchmark." },
  rita: { label: "Risky", color: "#f2c76b", blurb: "Expands fast, buys tools early, pays to pull workers in." },
};

function feedTone(kind: string): string {
  if (kind === "strike_start" || kind === "bankruptcy" || kind === "layoff" || kind === "theft" || kind === "fire")
    return "var(--madder-text)";
  if (kind === "phase_change" || kind === "gm_event" || kind === "election" || kind === "festival")
    return "var(--wheat-light)";
  if (kind === "hire" || kind === "job_change" || kind === "migration_in" || kind === "auction") return "var(--river-text)";
  if (kind === "trade" || kind === "birth") return "var(--meadow-text)";
  return "var(--text-secondary)";
}

export function Market() {
  const { view, session, running, play, pause } = useSolo();
  void view.day; // re-render each day the season advances

  const h = session.holdings();
  const standings = session.standings();
  const byType = new Map(standings.map((s) => [s.workshopType, s]));
  const shops = session.workshopSlots().map((slot) => ({
    slot,
    v: session.view(slot.workshopId),
    st: byType.get(slot.type),
  }));

  return (
    <div className="market">
      <header className="market__topbar">
        <Link to="/play" className="market__back">
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
            <path d="M11 3L5 9l6 6" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />
          </svg>
          Back to town
        </Link>
        <span className="market__clock">
          Day {view.day} of {view.totalDays} · {view.phaseLabel}
        </span>
        <div className="market__speed" role="group" aria-label="Game speed">
          <button type="button" aria-label="Pause" aria-pressed={!running} onClick={pause}>
            ❚❚
          </button>
          <button type="button" aria-label="Play" aria-pressed={running} onClick={play} disabled={view.ended}>
            ▶
          </button>
        </div>
        <div className="market__spacer" />
        <span className="market__town-stat">
          <span>Unemployment</span>
          <b style={{ color: view.unemploymentPct >= 15 ? "var(--madder-text)" : "var(--linen)" }}>
            {view.unemploymentPct}%
          </b>
        </span>
        <span className="market__town-stat">
          <span>Town mood</span>
          <b>{view.mood}</b>
        </span>
        <Link to="/scoreboard" className="market__pill">
          Scoreboard
        </Link>
        <Link to="/proof" className="market__pill market__pill--proof">
          Proof
        </Link>
      </header>

      <div className="market__body">
        <section aria-label="The workshops" className="market__shops">
          <h1 className="market__h1">The market</h1>
          <p className="market__lede">
            {shops.length} workshops compete for the same {session.population()} customers. You run the bakery; the
            others are AI owners, each with a readable strategy. Watch prices, wages and crews shift as the season runs.
          </p>
          <div className="market__grid">
            {shops.map(({ slot, v, st }) => {
              const good = GOODS[slot.type] ?? { good: slot.type, color: "var(--wheat)" };
              const strat = st && st.faceKey ? STRATEGY[st.faceKey] : null;
              const you = v.workshopType === view.workshopType;
              return (
                <article key={slot.workshopId} className={`market__shop${you ? " is-you" : ""}`}>
                  <div className="market__shop-head">
                    <span className="market__good" style={{ background: good.color }}>
                      {good.good}
                    </span>
                    <span className="market__owner">
                      {you ? <span className="market__you">You</span> : (st?.name ?? "—")}
                      {!you && strat && (
                        <span className="market__strat" style={{ color: strat.color }} title={strat.blurb}>
                          {strat.label}
                        </span>
                      )}
                    </span>
                    {v.bankrupt && <span className="market__flag market__flag--bust">Bankrupt</span>}
                    {v.onStrike && !v.bankrupt && <span className="market__flag market__flag--strike">On strike</span>}
                  </div>
                  <div className="market__rows">
                    <span>
                      Price <b>{v.price}</b>
                    </span>
                    <span>
                      Wage <b>{v.wage}</b>
                    </span>
                    <span>
                      Crew <b>{v.workers.length}/{v.maxWorkers}</b>
                    </span>
                    <span>
                      Stock <b>{v.stock}</b>
                    </span>
                    <span>
                      Sold today <b>{v.soldToday}</b>
                    </span>
                    <span>
                      Profit{" "}
                      <b style={{ color: v.profitToday >= 0 ? "var(--meadow-text)" : "var(--madder-text)" }}>
                        {v.profitToday >= 0 ? "+" : "−"}
                        {Math.abs(v.profitToday)}
                      </b>
                    </span>
                  </div>
                  <div className="market__standing">
                    <span className="market__treasury">{v.coins.toLocaleString()} coins in the till</span>
                    <span
                      className="market__rep"
                      style={{ color: v.reputation > 0 ? "var(--meadow-text)" : v.reputation < 0 ? "var(--madder-text)" : "var(--text-secondary)" }}
                    >
                      {v.reputationLabel} ({v.reputation > 0 ? "+" : ""}
                      {v.reputation})
                    </span>
                  </div>
                </article>
              );
            })}
          </div>

          <div className="market__public">
            <div className="market__public-card">
              <span className="market__public-name">Town Co-op</span>
              <b>{h.coop.toLocaleString()}</b>
              <small>wheat &amp; cotton, shared</small>
            </div>
            <div className="market__public-card">
              <span className="market__public-name">Town Hall</span>
              <b>{h.townHall.toLocaleString()}</b>
              <small>taxes &amp; public works</small>
            </div>
            <div className="market__public-card">
              <span className="market__public-name">Residents hold</span>
              <b>{h.residents.toLocaleString()}</b>
              <small>
                wages &amp; savings · {session.population()} people, {session.houses()} houses
              </small>
            </div>
            <div className="market__public-card market__public-card--total">
              <span className="market__public-name">Town total</span>
              <b>{h.total.toLocaleString()}</b>
              <small>fixed forever, on-chain</small>
            </div>
          </div>
        </section>

        <aside className="market__ledger" aria-label="Transactions across the town">
          <h2>Town ledger</h2>
          <p className="market__ledger-sub">Every wage, sale, hire and move — live.</p>
          <div className="market__ledger-list">
            {view.feed.length === 0 ? (
              <p className="market__ledger-empty">Press play — the town starts trading and the ledger fills.</p>
            ) : (
              view.feed.map((line: FeedLine, i: number) => (
                <div className="market__ledger-item" key={`${line.day}-${i}`}>
                  <span className="market__ledger-dot" style={{ background: feedTone(line.kind) }} />
                  <span>
                    {line.text} <span className="market__ledger-day">Day {line.day}</span>
                  </span>
                </div>
              ))
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
