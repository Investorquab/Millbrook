import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { PRICE_MAX, PRICE_MIN, WAGE_MAX, WAGE_MIN } from "@millbrook/economy";
import type { StandingRow, GmEventCard } from "@millbrook/economy";
import { useRoom, type WorkshopType } from "../game/RoomProvider";
import "./Room.css";

/** Keep in step with CHAT_MAX_LEN in apps/server/src/protocol.ts. */
const CHAT_MAX_LEN = 240;

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
            <RoomScoreboard standings={r.standings ?? []} myWorkshop={room.myWorkshop} />
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

          {!ended && r.gm && <GmCard gm={r.gm} />}

          {!ended && <TradePanel />}

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

      <ChatPanel />
    </div>
  );
}

/** Trade offers (the design's "offer N goods for P coins" decision card), driven
 *  by {@link useRoom}. Shown while a room is live. You post offers of your shop's
 *  output good for coins; others accept or decline. */
function TradePanel() {
  const room = useRoom();
  const [qty, setQty] = useState(1);
  const [coins, setCoins] = useState(5);
  const [to, setTo] = useState<string>("");

  const myGood = room.view ? GOOD_LABEL[room.view.workshopType] ?? "goods" : "goods";
  const others = (room.room?.players ?? []).filter((p) => p.id !== room.myId && p.workshopType);
  // Offers I can act on: open to the room, or addressed to me, and not my own.
  const incoming = room.offers.filter(
    (o) => o.fromPlayerId !== room.myId && (o.toPlayerId === null || o.toPlayerId === room.myId),
  );
  const mine = room.offers.filter((o) => o.fromPlayerId === room.myId);

  function post(e: FormEvent) {
    e.preventDefault();
    if (qty <= 0) return;
    room.offerTrade({ qty, coins, toPlayerId: to || null });
  }

  return (
    <section className="room__trade" aria-label="Trade offers">
      <h2>Deals</h2>
      {room.myWorkshop ? (
        <form className="room__trade-form" onSubmit={post}>
          <span>Offer</span>
          <input aria-label="Quantity" type="number" min={1} value={qty} onChange={(e) => setQty(Math.max(1, +e.target.value))} />
          <b>{myGood.toLowerCase()}</b>
          <span>for</span>
          <input aria-label="Price in coins" type="number" min={0} value={coins} onChange={(e) => setCoins(Math.max(0, +e.target.value))} />
          <span>coins</span>
          <select aria-label="Offer to" value={to} onChange={(e) => setTo(e.target.value)}>
            <option value="">to the room</option>
            {others.map((p) => (
              <option key={p.id} value={p.id}>
                to {p.name}
              </option>
            ))}
          </select>
          <button type="submit" className="room__btn-linen">
            Post offer
          </button>
        </form>
      ) : (
        <p className="room__trade-empty">Claim a shop to make and take trades.</p>
      )}

      <div className="room__trade-list">
        {incoming.map((o) => (
          <div key={o.id} className="room__offer">
            <span className="room__offer-text">
              <b>{o.fromName}</b> offers {o.qty} {o.good} for {o.coins} coins
              {o.toPlayerId === room.myId ? " (to you)" : ""}
            </span>
            {room.myWorkshop && (
              <span className="room__offer-actions">
                <button type="button" className="room__btn-linen" onClick={() => room.acceptTrade(o.id)}>
                  Accept
                </button>
                <button type="button" className="room__btn-ghost" onClick={() => room.declineTrade(o.id)}>
                  Decline
                </button>
              </span>
            )}
          </div>
        ))}
        {mine.map((o) => (
          <div key={o.id} className="room__offer room__offer--mine">
            <span className="room__offer-text">
              You offer {o.qty} {o.good} for {o.coins} coins{o.toPlayerId ? " (addressed)" : " (open)"}
            </span>
            <button type="button" className="room__btn-ghost" onClick={() => room.declineTrade(o.id)}>
              Withdraw
            </button>
          </div>
        ))}
        {incoming.length === 0 && mine.length === 0 && (
          <p className="room__trade-empty">No open deals. Tools lift a shop's output — a good thing to trade for.</p>
        )}
      </div>
    </section>
  );
}

/** Room chat + who's here, driven by {@link useRoom}. Shown in lobby and live. */
function ChatPanel() {
  const room = useRoom();
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  // Keep the newest message in view as chat grows.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [room.messages.length]);

  function send(e: FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    room.sendChat(draft);
    setDraft("");
  }

  const here = room.room?.players ?? [];

  return (
    <section className="room__chat" aria-label="Room chat">
      <div className="room__chat-head">
        <h2>Room chat</h2>
        <span className="room__chat-here">
          {here.length} here: {here.map((p) => (p.id === room.myId ? "you" : p.name)).join(", ")}
        </span>
      </div>
      <div className="room__chat-log" ref={listRef}>
        {room.messages.length === 0 && <p className="room__chat-empty">Say hello to the room.</p>}
        {room.messages.map((m) =>
          m.system ? (
            <p key={m.id} className="room__chat-sys">
              {m.text}
            </p>
          ) : (
            <p key={m.id} className="room__chat-line">
              <b className={m.playerId === room.myId ? "room__chat-me" : undefined}>
                {m.playerId === room.myId ? "You" : m.name}
              </b>
              <span>{m.text}</span>
            </p>
          ),
        )}
      </div>
      <form className="room__chat-form" onSubmit={send}>
        <input
          aria-label="Chat message"
          placeholder="Message the room…"
          maxLength={CHAT_MAX_LEN}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button type="submit" className="room__btn-linen" disabled={!draft.trim()}>
          Send
        </button>
      </form>
    </section>
  );
}

/** The Game Master "Why did this happen?" card — the live event and its reason,
 *  expandable, matching the solo HUD. */
function GmCard({ gm }: { gm: GmEventCard }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="room__gm" aria-label="Game Master event">
      <div className="room__gm-head">
        <span className="room__gm-tag">
          From the Game Master · {gm.source === "feed" ? "weather" : "town metrics"}
          {gm.active ? " · in effect" : ""}
        </span>
        <span className="room__gm-day">Day {gm.day}</span>
      </div>
      <h3 className="room__gm-title">{gm.title}</h3>
      <p className="room__gm-effect">{gm.effect}</p>
      <button type="button" className="room__gm-why" onClick={() => setOpen((o) => !o)}>
        {open ? "Hide" : "Why did this happen?"}
      </button>
      {open && (
        <div className="room__gm-reason">
          <p>{gm.reason}</p>
          <div className="room__gm-pills">
            {Object.entries(gm.data).map(([k, val]) => (
              <span key={k} className="room__gm-pill">
                {k}: {String(val)}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

/** The season-end scoreboard inside a room: every owner ranked by the goal card,
 *  the winner crowned, and the viewer's own shop marked "You". */
function RoomScoreboard({ standings, myWorkshop }: { standings: StandingRow[]; myWorkshop: WorkshopType | null }) {
  if (standings.length === 0) {
    return <p className="room__ended">The season has ended. Thanks for playing Millbrook.</p>;
  }
  const winner = standings[0]!;
  return (
    <section className="room__scoreboard" aria-label="Final standings">
      <div className="room__scoreboard-head">
        <h2>Season over</h2>
        <p className="room__scoreboard-winner">
          🏆 <b>{winner.name}</b> wins — {winner.workshopType && shopName(winner.workshopType)}, {winner.profit.toLocaleString()} profit.
        </p>
      </div>
      <ol className="room__scoreboard-rows">
        {standings.map((row) => {
          const mine = myWorkshop != null && row.workshopType === myWorkshop;
          return (
            <li key={row.ownerId} className={`room__sb-row${mine ? " is-you" : ""}${row.rank === 1 ? " is-winner" : ""}`}>
              <span className="room__sb-rank">{row.rank}</span>
              <span className="room__sb-name">
                {row.name}
                {mine && <span className="room__sb-you"> You</span>}
              </span>
              <span className="room__sb-shop">{shopName(row.workshopType)}</span>
              <span className="room__sb-profit">{row.profit.toLocaleString()}</span>
              {row.badges.length > 0 && (
                <span className="room__sb-badges">
                  {row.badges.map((b) => (
                    <span key={b.id} className="room__sb-badge" title={b.note}>
                      {b.label}
                    </span>
                  ))}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
