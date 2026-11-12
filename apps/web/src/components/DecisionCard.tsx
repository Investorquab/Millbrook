import type { Decision } from "@millbrook/economy";
import "./DecisionCard.css";

/**
 * A timed choice put to the player — a worker wage demand, a loan offer, a Game
 * Master choice. Shows the first pending card (with a "+N more" badge if several
 * queued) and its options; clicking one answers it. If the player ignores it,
 * the engine applies the default when the in-game deadline passes.
 */
export function DecisionCard({
  decisions,
  onDecide,
}: {
  decisions: Decision[];
  onDecide: (id: string, optionId: string) => void;
}) {
  if (decisions.length === 0) return null;
  const d = decisions[0]!;
  const more = decisions.length - 1;

  return (
    <section className="decision" aria-label="A decision">
      <div className="decision__head">
        <span className="decision__tag">Decision · answer by day {d.deadlineDay}</span>
        {more > 0 && <span className="decision__more">+{more} more</span>}
      </div>
      <h3 className="decision__title">{d.title}</h3>
      <p className="decision__body">{d.body}</p>
      <div className="decision__options">
        {d.options.map((o, i) => (
          <button
            key={o.id}
            type="button"
            className={`decision__btn${i === 0 ? " is-primary" : ""}`}
            onClick={() => onDecide(d.id, o.id)}
            title={o.detail}
          >
            {o.label}
          </button>
        ))}
      </div>
      {d.options.some((o) => o.detail) && (
        <p className="decision__detail">{d.options.find((o) => o.detail)?.detail}</p>
      )}
    </section>
  );
}
