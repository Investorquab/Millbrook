import { Link } from "react-router-dom";
import { useSolo } from "../game/SoloProvider";
import "./Gazette.css";

/**
 * The Millbrook Gazette — ported from `design/screenshots/Gazette.png`. This is
 * the deterministic template edition: every line is built from the week's real
 * feed events and the live price history (`session.gazette()`), nothing invented.
 * The NEAR-AI-written edition arrives in M5; until then the page says so.
 */

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
  const figure = leadFigure(g.lead.paragraphs);

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
          Written each game week from what really happened in your town. This is the template edition; the
          NEAR-AI-written Gazette arrives in M5.
        </span>
      </div>

      <article className="gz__paper">
        <header className="gz__masthead">
          <h1>The Millbrook Gazette</h1>
          <span>{g.dateline}</span>
        </header>

        <div className="gz__columns">
          <div className="gz__main">
            <h2 className="gz__lead-head">{g.lead.heading}</h2>
            <div className="gz__lead-body">
              {figure && <img src={figure.src} alt={figure.name} className="gz__figure" />}
              <div className="gz__lead-text">
                {g.lead.paragraphs.map((p, i) => (
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
