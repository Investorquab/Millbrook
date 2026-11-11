import { useState } from "react";
import type { CSSProperties, FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useRoom } from "../game/RoomProvider";
import "./Room.css";

/**
 * Join a room from an invite link (`/join?code=ABC123`) or by typing a code.
 * Enters the networked {@link Room} once the server acknowledges.
 */
export function Join() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const room = useRoom();
  const [code, setCode] = useState((params.get("code") ?? "").toUpperCase());
  const [name, setName] = useState("");

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!code.trim() || !name.trim()) return;
    room.joinRoom(code, name.trim());
    navigate("/room");
  }

  return (
    <div className="room room--empty">
      <div style={{ width: "min(420px, 90vw)", display: "flex", flexDirection: "column", gap: 16 }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 36, margin: 0 }}>Join a town</h1>
        <p style={{ color: "var(--text-soft)", margin: 0 }}>Enter the room code a friend shared with you.</p>
        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <input
            aria-label="Your name"
            placeholder="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={inputStyle}
          />
          <input
            aria-label="Room code"
            placeholder="Room code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            style={{ ...inputStyle, letterSpacing: "0.1em", fontFamily: "var(--font-display)" }}
          />
          <button type="submit" className="room__start" disabled={!code.trim() || !name.trim()}>
            Join the room
          </button>
        </form>
        {room.error && <p className="room__error">{room.error}</p>}
        <button type="button" className="room__btn-ghost" onClick={() => navigate("/hub")}>
          Back to the hub
        </button>
      </div>
    </div>
  );
}

const inputStyle: CSSProperties = {
  height: 48,
  borderRadius: 10,
  border: "1px solid rgba(237,230,214,0.3)",
  background: "rgba(36,42,50,0.9)",
  color: "var(--linen)",
  padding: "0 14px",
  font: "600 16px var(--font-body)",
};
