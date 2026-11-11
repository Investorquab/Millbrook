import { useNavigate } from "react-router-dom";
import { PRICE_MAX, PRICE_MIN, WAGE_MAX, WAGE_MIN } from "@millbrook/economy";
import { useRoom } from "../game/RoomProvider";
import "./Room.css";

/**
 * A networked room — the lobby and the live town over Socket.IO, driven by
 * {@link RoomProvider}. Matches the structure of `design/screenshots/Lobby.png`
 * for what's wired: the live invite code, the real player slots, and the start
 * button. Per-player workshops, chat and the settings pickers are marked as
 * roadmap rather than faked.
 */

const WORKSHOP_SLOTS = ["Bakery", "Smithy", "Weaver", "Brewery"] as const;

function Stepper({
  label,
  value,
  unit,
  min,
  max,
  disabled,
  onLower,
  onRaise,
}: {
  label: string;
  value: number;
  unit: string;
  min: number;
  max: number;
  disabled: boolean;
  onLower: () => void;
  onRaise: () => void;
}) {
  return (
    <div className="room__control">
      <span>{label}</span>
      <div className="room__stepper">
        <button type="button" aria-label={`Lower the ${label.toLowerCase()}`} onClick={onLower} disabled={disabled || value <= min}>
          −
        </button>
        <span className="room__stepper-value">
          {value} {unit}
        </span>
        <button type="button" aria-label={`Raise the ${label.toLowerCase()}`} onClick={onRaise} disabled={disabled || value >= max}>
          +
        </button>
      </div>
    </div>
  );
}

export function Room() {
  const navigate = useNavigate();
  const room = useRoom();

  function leave() {
    room.leaveRoom();
    navigate("/hub");
  }

  if (!room.room) {
    return (
      <div className="room room--empty">
        <p>{room.error ?? "Connecting to the town…"}</p>
        <button type="button" className="room__btn-ghost" onClick={() => navigate("/hub")}>
          Back to the hub
        </button>
      </div>
    );
  }

  const r = room.room;
  const v = room.view;
  const live = r.status === "live";
  const ended = r.status === "ended";
  const inviteUrl = `${window.location.origin}/join?code=${r.code}`;

  return (
    <div className="room">
      <div className="room__backdrop" aria-hidden="true">
        <img src="/art/town.svg" alt="" />
      </div>

      <div className="room__topbar">
        <button type="button" className="room__back" onClick={leave}>
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
            <path d="M11 3L5 9l6 6" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />
          </svg>
          Leave room
        </button>
        <span className="room__role">{room.isHost ? "You're the host" : "In the room"}</span>
      </div>

      <div className="room__head">
        <div>
          <h1>Millbrook room</h1>
          <p>Share the code. Friends land here, and the host starts the town.</p>
        </div>
        <div className="room__code">
          <span className="room__code-value">{r.code}</span>
          <button
            type="button"
            className="room__btn-linen"
            onClick={() => navigator.clipboard?.writeText(inviteUrl).catch(() => {})}
          >
            Copy invite link
          </button>
        </div>
      </div>

      {room.error && <p className="room__error">{room.error}</p>}

      {/* Player / workshop slots */}
      <div className="room__slots">
        {WORKSHOP_SLOTS.map((slot, i) => {
          const player = r.players[i];
          return (
            <div key={slot} className={`room__slot ${player ? "room__slot--filled" : "room__slot--ai"}`}>
              <span className="room__slot-shop">{slot}</span>
              {player ? (
                <>
                  <span className="room__slot-name">{player.name}</span>
                  <span className="room__slot-state">{player.isHost ? "Host" : "Joined"}</span>
                </>
              ) : (
                <>
                  <span className="room__slot-name room__slot-name--ai">AI owner</span>
                  <span className="room__slot-state">Fills this shop until someone joins</span>
                </>
              )}
            </div>
          );
        })}
      </div>

      {!live && !ended ? (
        <div className="room__lobby">
          <div className="room__settings">
            <div>
              <h2>This town</h2>
              <p>30 residents, the four Phase-1 workshops, seed #{r.seed}.</p>
            </div>
            <div>
              <h2>Speed &amp; goal</h2>
              <p>Live, ~20 minutes · Tycoon. Speed, goal-card and chat pickers are on the roadmap.</p>
            </div>
          </div>
          <div className="room__start-row">
            {room.isHost ? (
              <button type="button" className="room__start" onClick={room.startRoom}>
                Start the season
              </button>
            ) : (
              <span className="room__waiting">Waiting for the host to start…</span>
            )}
            <span className="room__playercount">
              {r.players.length} in the room
            </span>
          </div>
        </div>
      ) : (
        <div className="room__live">
          <div className="room__live-stats" aria-label="Live town">
            <span>
              <small>Day</small>
              <b>
                {v?.day ?? r.day} / {r.totalDays}
              </b>
            </span>
            <span>
              <small>Your coins</small>
              <b>{(v?.coins ?? 0).toLocaleString()}</b>
            </span>
            <span>
              <small>Unemployment</small>
              <b>{v?.unemploymentPct ?? 0}%</b>
            </span>
            <span>
              <small>Mood</small>
              <b>{v?.mood ?? "—"}</b>
            </span>
            <span>
              <small>Sold today</small>
              <b>{v?.soldToday ?? 0}</b>
            </span>
          </div>

          {ended ? (
            <p className="room__ended">The season has ended. Thanks for playing Millbrook.</p>
          ) : (
            <div className="room__controls" aria-label="Your bakery">
              {room.isHost ? (
                <>
                  <Stepper
                    label="Bread price"
                    value={v?.price ?? 3}
                    unit="coins"
                    min={PRICE_MIN}
                    max={PRICE_MAX}
                    disabled={!v}
                    onLower={() => room.setPrice((v?.price ?? 3) - 1)}
                    onRaise={() => room.setPrice((v?.price ?? 3) + 1)}
                  />
                  <Stepper
                    label="Wage"
                    value={v?.wage ?? 8}
                    unit="a day"
                    min={WAGE_MIN}
                    max={WAGE_MAX}
                    disabled={!v}
                    onLower={() => room.setWage((v?.wage ?? 8) - 1)}
                    onRaise={() => room.setWage((v?.wage ?? 8) + 1)}
                  />
                  <div className="room__live-actions">
                    <button type="button" className="room__btn-linen" onClick={room.hire} disabled={!v?.canHire}>
                      {v?.canHire ? "Hire a baker" : "Bakery full"}
                    </button>
                    <button type="button" className="room__btn-ghost" onClick={room.play}>
                      Play
                    </button>
                    <button type="button" className="room__btn-ghost" onClick={room.pause}>
                      Pause
                    </button>
                  </div>
                </>
              ) : (
                <p className="room__waiting">The host runs the bakery. Per-player workshops are on the roadmap.</p>
              )}
            </div>
          )}

          <div className="room__feed" aria-label="Town feed">
            {(v?.feed ?? []).slice(0, 8).map((line, i) => (
              <div key={`${line.day}-${i}`} className="room__feed-item">
                <span>{line.text}</span>
                <span className="room__feed-day">Day {line.day}</span>
              </div>
            ))}
            {(!v || v.feed.length === 0) && <p className="room__feed-empty">The town is waking up…</p>}
          </div>
        </div>
      )}
    </div>
  );
}
