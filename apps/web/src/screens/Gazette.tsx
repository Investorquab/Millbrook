import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useSolo } from "../game/SoloProvider";
import { apiUrl } from "../game/serverUrl";
import "./Gazette.css";

/**
 * The Millbrook Gazette — ported from `design/screenshots/Gazette.png`. Every
 * line is built from the week's real feed events and the live price history
 * (`session.gazette()`), nothing invented. When a server with a NEAR AI key is
 * reachable it rewrites the lead story from the same real events (Step 3.4);
 * otherwise the deterministic template edition is shown.
 */

interface AiLead {
  heading: string;
  paragraphs: string[];
}

const OWNER_KEYS = ["gus", "fern", "sam", "rita"] as const;

/** If the lead story is about one of the AI owners, show their figure beside it. */
function leadFigure(paragraphs: string[]): { src: string; name: string } | null {
  const text = paragraphs.join(" ").toLowerCase();
  const names: Record<(typeof OWNER_KEYS)[number], string> = {
    gus: "Greedy Gus",
    fern: "Fair Fern",
    sam: "Steady Sam",
    rita: "Risky Rita",
  };
  for (const key of OWNER_KEYS) {
    if (text.includes(key)) return { src: `/art/char-${key}.svg`, name: names[key] };
  }
  return null;
}

export function Gazette() {
  const { session } = useSolo();
  const g = session.gazette();

  // Ask a server (the full deploy) to rewrite the lead from this week's real
  // events with NEAR AI. On the static solo deploy, or without a funded key,
  // the fetch returns "template" (or fails) and we keep the template edition.
  const [aiLead, setAiLead] = useState<AiLead | null>(null);
  useEffect(() => {
    let alive = true;
    setAiLead(null);
    fetch(apiUrl("/gazette"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ week: g.week, printDay: g.day, events: g.facts }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { source?: string; lead?: AiLead } | null) => {
        if (alive && j?.source === "near-ai" && j.lead) setAiLead(j.lead);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
    // Facts are fixed by the week; join to a stable dep (arrays change identity).
  }, [g.week, g.day, g.facts.join("\u0001")]);

  const lead = aiLead ?? g.lead;
  const figure = leadFigure(lead.paragraphs);

  return (
    <div className="gz">
      <div className="gz__backdrop" aria-hidden="true">
        <img src="/art/town.svg" alt="" />
      </div>

      <div className="gz__rail">
        <Link to="/play" className="gz__back">
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
            <path d="M11 3L5 9l6 6" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />
          </svg>
          Back to town
        </Link>
        <span className="gz__rail-note">
          {aiLead
            ? "Written by NEAR AI from this week's real events — the model reports only what happened, invents nothing."
            : "Written each game week from what really happened in your town. Template edition (NEAR AI writes it when the server has a key)."}
        </span>
      </div>

      <article className="gz__paper">
        <header className="gz__masthead">
          <h1>The Millbrook Gazette</h1>
          <span>{g.dateline}</span>
        </header>

        <div className="gz__columns">
          <div className="gz__main">
            <h2 className="gz__lead-head">{lead.heading}</h2>
            <div className="gz__lead-body">
              {figure && <img src={figure.src} alt={figure.name} className="gz__figure" />}
              <div className="gz__lead-text">
                {lead.paragraphs.map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
              </div>
            </div>

            {g.secondary && (
              <div className="gz__secondary">
                <h3>{g.secondary.heading}</h3>
                {g.secondary.paragraphs.map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
              </div>
            )}
          </div>

          <aside className="gz__aside">
            <div className="gz__block">
              <h3>Prices this week</h3>
              <table>
                <thead>
                  <tr>
                    <th scope="col">Good</th>
                    <th scope="col">Last week</th>
                    <th scope="col">Now</th>
                  </tr>
                </thead>
                <tbody>
                  {g.prices.map((row) => {
                    const up = row.lastWeek !== null && row.now > row.lastWeek;
                    const down = row.lastWeek !== null && row.now < row.lastWeek;
                    return (
                      <tr key={row.good}>
                        <td>{row.good}</td>
                        <td className="gz__num">{row.lastWeek === null ? "—" : row.lastWeek}</td>
                        <td className={`gz__num ${up ? "gz__up" : down ? "gz__down" : ""}`}>
                          {row.now}
                          {up ? " ▲" : down ? " ▼" : ""}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="gz__block">
              <h3>Comings and goings</h3>
              {g.comingsAndGoings.map((line, i) => (
                <p key={i}>{line}</p>
              ))}
            </div>

            <div className="gz__notice">{g.notice}</div>
          </aside>
        </div>
      </article>
    </div>
  );
}
