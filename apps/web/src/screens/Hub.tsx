import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { color } from "../theme/tokens";
import { useRoom } from "../game/RoomProvider";
import { useSolo } from "../game/SoloProvider";
import "./Hub.css";

/**
 * Home hub — ported from `design/screenshots/Hub.png`. The player's base: start
 * a solo season, read the league report, host or join a room, and see trophies.
 *
 * Host/Join are wired to the live rooms server (M5) via {@link RoomProvider}.
 * League status, the report and trophies are sample data; they come from the
 * server and the contract as those land.
 */
const PLAYER_NAME = "millhand";

export function Hub() {
  const navigate = useNavigate();
  const room = useRoom();
  const { session } = useSolo();
  const [code, setCode] = useState("");

  // The goal the solo season is scored against — chosen here, read on the
  // Scoreboard. Persists on the shared session across the in-app navigation.
  const goals = session.goalCards();
  const [goalId, setGoalId] = useState(() => session.goalCard().id);
  const activeGoal = goals.find((g) => g.id === goalId) ?? goals[0]!;
  function chooseGoal(id: string) {
    session.setGoalCard(id);
    setGoalId(id);
  }

  function onHost() {
    room.createRoom(PLAYER_NAME);
    navigate("/room");
  }

  function onJoin(e: FormEvent) {
    e.preventDefault();
    if (code.trim().length === 0) return;
    room.joinRoom(code, PLAYER_NAME);
    navigate("/room");
  }

  return (
    <div className="hub">
      <div className="hub__backdrop" aria-hidden="true">
        <img src="/art/town.svg" alt="" />
      </div>

      <header className="hub__header">
        <Link to="/" className="hub__wordmark">
          Millbrook
        </Link>
        <div className="hub__account">
          <span className="hub__avatar">M</span>
          <span className="hub__account-text">
            <span className="hub__account-name">millhand</span>
            <span className="hub__account-rep">Fair employer, +42</span>
          </span>
        </div>
      </header>

      <main className="hub__main">
        <section className="hub__solo">
          <div className="hub__solo-scene">
            <img src="/art/town.svg" alt="Millbrook seen from above" />
            <div className="hub__solo-tag">You plus 3 AI owners</div>
          </div>
          <div className="hub__solo-foot">
            <div className="hub__solo-copy">
              <h2>Play solo</h2>
              <p>
                One season, about 20 minutes. Run a bakery against Gus, Fern and Rita, and fast-forward whenever you
                like.
              </p>
              <div className="hub__goal" role="group" aria-label="Choose your goal">
                <span className="hub__goal-label">Your goal</span>
                <div className="hub__goal-chips">
                  {goals.map((g) => (
                    <button
                      type="button"
                      key={g.id}
                      className={`hub__goal-chip${g.id === goalId ? " is-active" : ""}`}
                      aria-pressed={g.id === goalId}
                      onClick={() => chooseGoal(g.id)}
                    >
                      {g.name}
                    </button>
                  ))}
                </div>
                <span className="hub__goal-how">{activeGoal.howToWin}</span>
              </div>
            </div>
            <Link to="/play" className="hub__cta">
              Start a season
              <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true">
                <path d="M6 4l9 6-9 6z" fill={color.millstone} />
              </svg>
            </Link>
          </div>
        </section>

        <div className="hub__side">
          <section className="hub__panel hub__panel--league">
            <div className="hub__panel-head">
              <h2>Your league</h2>
              <span className="hub__season">Season 3, day 4 of 7</span>
            </div>
            <div className="hub__report">
              <img src="/art/face-gus.svg" alt="Greedy Gus" />
              <p>Your morning report is ready. Gus poached your best baker overnight.</p>
            </div>
            <Link to="/play" className="hub__btn-outline">
              Read the report
            </Link>
          </section>

          <section className="hub__panel hub__row">
            <div>
              <h2>Host a room</h2>
              <p>Invite up to 3 friends. AI fills the empty shops.</p>
            </div>
            <button type="button" className="hub__btn-linen" onClick={onHost}>
              Create room
            </button>
          </section>

          <section className="hub__panel hub__join">
            <form onSubmit={onJoin} style={{ display: "contents" }}>
              <label htmlFor="code">Join with a code</label>
              <div className="hub__join-row">
                <input
                  id="code"
                  type="text"
                  placeholder="MILL-4821"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                />
                <button type="submit" className="hub__btn-linen">
                  Join
                </button>
              </div>
            </form>
          </section>

          <section className="hub__panel hub__trophies">
            <h2>Trophies</h2>
            <div className="hub__trophy-row">
              <div className="hub__trophy">
                <svg width="32" height="32" viewBox="0 0 32 32" aria-hidden="true">
                  <path
                    d="M16 3l3.6 7.4 8.1 1.2-5.9 5.7 1.4 8.1L16 21.6l-7.2 3.8 1.4-8.1-5.9-5.7 8.1-1.2z"
                    fill={color.wheat}
                  />
                </svg>
                <span>
                  <b>Fair Boss</b>
                  <br />
                  <small>Season 2</small>
                </span>
              </div>
              <div className="hub__trophy">
                <svg width="32" height="32" viewBox="0 0 32 32" aria-hidden="true">
                  <circle cx="16" cy="16" r="12" fill={color.meadow} />
                  <path d="M10 16l4 4 8-8" stroke={color.deep} strokeWidth="3" fill="none" />
                </svg>
                <span>
                  <b>Town Hero</b>
                  <br />
                  <small>Season 1</small>
                </span>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
