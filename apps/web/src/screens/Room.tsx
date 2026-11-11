import { useNavigate } from "react-router-dom";
import { PRICE_MAX, PRICE_MIN, WAGE_MAX, WAGE_MIN } from "@millbrook/economy";
import { useRoom, type WorkshopType } from "../game/RoomProvider";
import "./Room.css";

/**
 * A networked room — the lobby and the live town over Socket.IO, driven by
 * {@link RoomProvider}. The live invite code, the claimable shop slots, and the
 * start button are wired to the server; each player claims one shop and runs it
 * (the host runs the bakery). Chat and the settings pickers are roadmap.
 */

const SHOP_LABEL: Record<string, string> = {
  bakery: "Bakery",
  weaver: "Weaver",
  smithy: "Smithy",
  brewery: "Brewery",
  tailor: "Tailor",
  tavern: "Tavern",
  carpenter: "Carpenter",
  apothecary: "Apothecary",
};
const shopName = (type: WorkshopType | string) => SHOP_LABEL[type] ?? type;

/** The good each shop sells, for labelling the price stepper. */
const GOOD_LABEL: Record<string, string> = {
  bakery: "Bread",
  weaver: "Cloth",
  smithy: "Tools",
  brewery: "Ale",
};

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

      {/* Claimable shop slots — one per player, AI fills the rest */}
      <div className="room__slots">
        {r.slots.map((slot) => {
          const owner = r.players.find((p) => p.workshopType === slot.type);
          const mine = owner?.id === room.myId;
          const canClaim = !slot.claimed && room.myWorkshop === null && !live && !ended;
          return (
            <div key={slot.type} className={`room__slot ${slot.claimed ? "room__slot--filled" : "room__slot--ai"} ${mine ? "room__slot--mine" : ""}`}>
              <span className="room__slot-shop">{shopName(slot.type)}</span>
              {owner ? (
                <>
                  <span className="room__slot-name">{mine ? "You" : owner.name}</span>
                  <span className="room__slot-state">{owner.isHost ? "Host · runs the bakery" : "Running this shop"}</span>
                </>
              ) : (
                <>
                  <span className="room__slot-name room__slot-name--ai">AI owner</span>
                  {canClaim ? (
                    <button type="button" className="room__claim" onClick={() => room.claimWorkshop(slot.type)}>
                      Claim this shop
                    </button>
                  ) : (
                    <span className="room__slot-state">Runs until a player claims it</span>
                  )}
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
              <p>
                30 residents, the four Phase-1 workshops, seed #{r.seed}.{" "}
                {room.myWorkshop
                  ? `You run the ${shopName(room.myWorkshop).toLowerCase()}.`
                  : "Claim a shop above to run one, or watch."}
              </p>
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
            <div className="room__controls" aria-label="Your shop">
              {room.myWorkshop ? (
                <>
                  <Stepper
                    label={`${GOOD_LABEL[v?.workshopType ?? "bakery"] ?? "Good"} price`}
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
                      {v?.canHire ? "Hire a worker" : "Shop full"}
                    </button>
                    {room.isHost && (
                      <>
                        <button type="button" className="room__btn-ghost" onClick={room.play}>
                          Play
                        </button>
                        <button type="button" className="room__btn-ghost" onClick={room.pause}>
                          Pause
                        </button>
                      </>
                    )}
                  </div>
                </>
              ) : (
                <p className="room__waiting">You're watching this season. Claim a shop from the lobby next time to run one.</p>
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
