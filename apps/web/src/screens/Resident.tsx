import { Link } from "react-router-dom";
import { useSolo } from "../game/SoloProvider";
import { charFor, faceFor } from "../game/faces";
import "./Resident.css";

/**
 * Resident card — ported from `design/screenshots/Resident.png` and wired to the
 * live season. Shows a real resident from the town: their trait, employer, wage,
 * savings, this week's needs, and the reasons behind their recent choices, all
 * straight from `@millbrook/economy` (the `lastReason` the rules record, plus
 * the feed events about them). "Offer a raise" raises the player's bakery wage.
 */

const NeedIcon = ({ status }: { status: "done" | "pending" | "later" }) => {
  if (status === "done")
    return (
      <svg width="18" height="18" viewBox="0 0 18 18" aria-label="done">
        <circle cx="9" cy="9" r="8" fill="#6E9B5A" />
        <path d="M5 9l3 3 5-6" stroke="#1E242B" strokeWidth="2" fill="none" />
      </svg>
    );
  if (status === "pending")
    return (
      <svg width="18" height="18" viewBox="0 0 18 18" aria-label="not yet">
        <circle cx="9" cy="9" r="7.5" fill="none" stroke="#F2C76B" strokeWidth="1.6" />
        <path d="M9 5v4.5l3 2" stroke="#F2C76B" strokeWidth="1.6" fill="none" />
      </svg>
    );
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-label="later">
      <circle cx="9" cy="9" r="7.5" fill="none" stroke="#B9B2A4" strokeWidth="1.6" />
    </svg>
  );
};

export function Resident() {
  const { session, view, setWage } = useSolo();
  const card = session.residentCard();

  if (!card) {
    return (
      <div className="resident">
        <div className="resident__backdrop" aria-hidden="true">
          <img src="/art/town.svg" alt="" />
        </div>
        <section className="resident__empty">
          <h1 style={{ fontSize: 28, marginBottom: 8 }}>Nobody's about just yet</h1>
          <p style={{ color: "var(--text-soft)", marginBottom: 20 }}>
            Start a season and run a day or two, then tap a resident to see what drives their choices.
          </p>
          <Link to="/play" className="resident__follow" style={{ justifyContent: "center" }}>
            Back to town
          </Link>
        </section>
      </div>
    );
  }

  const char = charFor(card.name);
  const face = faceFor(card.name);
  const canRaise = card.worksForPlayer && view.wage < 12;

  return (
    <div className="resident">
      <div className="resident__backdrop" aria-hidden="true">
        <img src="/art/town.svg" alt="" />
      </div>

      <section className="resident__card" aria-label={`${card.name}, ${card.employerLabel}`}>
        <div className="resident__portrait">
          {char ? (
            <img src={char} alt={`${card.name}, a ${card.traitLabel.toLowerCase()} resident of Millbrook`} />
          ) : (
            <div className="resident__portrait-fallback" style={{ background: face.color }}>
              {face.initial}
            </div>
          )}
        </div>

        <div className="resident__body">
          <div className="resident__head">
            <div>
              <h1>{card.name}</h1>
              <p className="resident__sub">
                {card.employerLabel}, {card.age}
              </p>
            </div>
            <Link to="/play" className="resident__close" aria-label="Close">
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                <path d="M3 3l10 10M13 3L3 13" stroke="#EDE6D6" strokeWidth="2" />
              </svg>
            </Link>
          </div>

          <div className="resident__tags">
            <span className="resident__tag">{card.traitLabel}</span>
            <span className="resident__tag" style={{ color: "var(--meadow-text)" }}>
              {card.mood}
            </span>
            {card.worksForPlayer && <span className="resident__tag">On your crew</span>}
          </div>

          <div className="resident__stats">
            <div className="resident__stat">
              <span>Last wage</span>
              <b>{card.wage} coins</b>
            </div>
            <div className="resident__stat">
              <span>Savings</span>
              <b>{card.savings} coins</b>
            </div>
            <div className="resident__stat">
              <span>{card.daysUnemployed > 0 ? "Days without work" : "Status"}</span>
              <b>{card.daysUnemployed > 0 ? `${card.daysUnemployed} days` : "Working"}</b>
            </div>
          </div>

          <div className="resident__section">
            <h2>This week's needs</h2>
            <div className="resident__needs">
              {card.needs.map((need) => (
                <span className="resident__need" key={need.label}>
                  <NeedIcon status={need.status} />
                  {need.label}
                </span>
              ))}
            </div>
          </div>

          <div className="resident__section">
            <h2>Why {card.name} chose as they did</h2>
            <div className="resident__reasons">
              <span>
                <b>Now.</b> {card.currentReason}
              </span>
              {card.history.map((h, i) => (
                <span key={`${h.day}-${i}`}>
                  <b>Day {h.day}.</b> {h.text}
                </span>
              ))}
            </div>
          </div>

          <div className="resident__actions">
            <button
              type="button"
              className="resident__raise"
              onClick={() => setWage(view.wage + 1)}
              disabled={!canRaise}
            >
              {card.worksForPlayer ? `Offer a raise to ${Math.min(view.wage + 1, 12)}` : "Not on your crew"}
            </button>
            <Link to="/proof" className="resident__follow">
              Follow one of {card.name}'s coins
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
