import { Link } from "react-router-dom";
import { useSolo } from "../game/SoloProvider";
import "./Scoreboard.css";

/**
 * Season end — ported from `design/screenshots/Scoreboard.png`. Standings,
 * trophy and town health are all live: they come from `session.standings()` and
 * `session.seasonSummary()`, ranked by the active goal card. The season need not
 * have ended to open this (you can skip to it from fast-forward); the numbers
 * are the town exactly as it stands.
 */

function sign(n: number): string {
  return `${n >= 0 ? "+" : ""}${n.toLocaleString()}`;
}

export function Scoreboard() {
  const { session, view } = useSolo();
  const summary = session.seasonSummary();
  const rows = session.standings();

  return (
    <div className="sb">
      <div className="sb__backdrop" aria-hidden="true">
        <img src="/art/town.svg" alt="" />
      </div>

      <div className="sb__inner">
        <header className="sb__head">
          <span className="sb__eyebrow">
            Day {view.day} of {summary.totalDays}. Goal card: {summary.goal.name}
          </span>
          <h1>{summary.headline}</h1>
          <p>{summary.blurb}</p>
          {summary.townGoal && (
            <span className={`sb__town-goal${summary.townGoal.met ? " is-met" : ""}`}>
              {summary.townGoal.met ? "Goal achieved" : "Goal missed"}
            </span>
          )}
        </header>

        <div className="sb__body">
          <section className="sb__standings" aria-label="Final standings">
            <table>
              <thead>
                <tr>
                  <th scope="col" className="sb__col-owner">
                    Owner
                  </th>
                  <th scope="col" className="sb__num">
                    Profit
                  </th>
                  <th scope="col" className="sb__num">
                    Workers
                  </th>
                  <th scope="col" className="sb__num">
                    Wage
                  </th>
                  <th scope="col" className="sb__num">
                    Reputation
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.ownerId} className={r.isPlayer ? "sb__you" : undefined}>
                    <td>
                      <span className="sb__owner">
                        <span className="sb__rank">{r.rank}</span>
                        {r.faceKey ? (
                          <img src={`/art/face-${r.faceKey}.svg`} alt="" className="sb__face" />
                        ) : (
                          <span className="sb__face sb__face--you">Y</span>
                        )}
                        <span className="sb__owner-text">
                          <b>{r.isPlayer ? "You (your bakery)" : r.name}</b>
                          {r.badges.length > 0 && (
                            <span className="sb__badges">
                              {r.badges.map((b) => (
                                <span key={b.id} className="sb__badge" title={b.note}>
                                  {b.label}
                                </span>
                              ))}
                            </span>
                          )}
                        </span>
                      </span>
                    </td>
                    <td className="sb__num sb__profit">{sign(r.profit)}</td>
                    <td className="sb__num">{r.workers}</td>
                    <td className="sb__num">{r.wage}</td>
                    <td className={`sb__num ${r.reputation > 0 ? "pos" : r.reputation < 0 ? "neg" : ""}`}>
                      {r.reputation === 0 ? "—" : sign(r.reputation)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="sb__footnote">
              Ranked by the {summary.goal.name} card: {summary.goal.howToWin.toLowerCase()} Reputation runs from −100
              (Ruthless) to +100 (Fair) and moves with wages against the town, layoffs and strikes.
            </p>
          </section>

          <aside className="sb__aside">
            {summary.trophy ? (
              <section className="sb__trophy" aria-label="Trophy earned">
                <svg width="72" height="72" viewBox="0 0 72 72" aria-hidden="true">
                  <circle cx="36" cy="36" r="34" fill="#2b323b" stroke="#D9A441" strokeWidth="2" />
                  <path
                    d="M36 12l6.9 14 15.4 2.2-11.2 10.9 2.6 15.4L36 47.2l-13.7 7.3 2.6-15.4L13.7 28.2l15.4-2.2z"
                    fill="#D9A441"
                  />
                </svg>
                <div className="sb__trophy-text">
                  <span>Trophy earned</span>
                  <b>{summary.trophy.name}</b>
                  <span className="sb__trophy-note">{summary.trophy.note}</span>
                </div>
              </section>
            ) : (
              <section className="sb__trophy sb__trophy--none" aria-label="No trophy yet">
                <div className="sb__trophy-text">
                  <span>No trophy this season</span>
                  <b>Keep playing</b>
                  <span className="sb__trophy-note">
                    Win your goal card, or hold every worker through a downturn, to earn one.
                  </span>
                </div>
              </section>
            )}

            <section className="sb__town" aria-label="How the town did">
              <h2>How the town did</h2>
              <div className="sb__town-grid">
                <span>
                  <span className="sb__town-cap">Unemployment</span>
                  <b>{summary.unemploymentPct}%</b>
                </span>
                <span>
                  <span className="sb__town-cap">Residents</span>
                  <b>{summary.residents}</b>
                </span>
                <span>
                  <span className="sb__town-cap">Coins</span>
                  <b className="sb__coins">{summary.coins.toLocaleString()}</b>
                </span>
              </div>
              <p>{summary.townNote}</p>
            </section>
          </aside>
        </div>

        <div className="sb__actions">
          <Link to="/hub" className="sb__btn sb__btn--primary">
            Play another season
          </Link>
          <Link to="/gazette" className="sb__btn">
            Read the final Gazette
          </Link>
          <Link to="/proof" className="sb__btn">
            See the proof
          </Link>
        </div>
      </div>
    </div>
  );
}
