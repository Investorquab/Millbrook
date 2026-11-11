import type { Tour } from "../game/useTutorial";
import "./Tutorial.css";

/**
 * The coach card for the guided first session. Presentational only — all the
 * step logic lives in {@link useTutorial}; the Town screen owns the tour and
 * writes `data-tour` onto its root so the matching control lights up. The card
 * floats at top-centre over the empty scene band, never covering the HUD, and
 * does not block clicks to the real controls beneath it.
 */
export function TutorialCard({ tour }: { tour: Tour }) {
  if (!tour.active) return null;
  const { step, index, total } = tour;

  return (
    <div className="tour" role="dialog" aria-label="Getting started" aria-live="polite">
      <div className="tour__card">
        <div className="tour__head">
          <span className="tour__badge">Getting started</span>
          <button type="button" className="tour__skip" onClick={tour.skip}>
            Skip tour
          </button>
        </div>

        <h2 className="tour__title">{step.title}</h2>
        <p className="tour__body">{step.body}</p>

        <div className="tour__foot">
          <span className="tour__dots" aria-hidden="true">
            {Array.from({ length: total }).map((_, i) => (
              <span key={i} className={`tour__dot${i === index ? " is-on" : ""}${i < index ? " is-done" : ""}`} />
            ))}
          </span>
          {step.manual ? (
            <button type="button" className="tour__next" onClick={tour.next}>
              {step.cta}
            </button>
          ) : (
            <span className="tour__hint">{step.hint}</span>
          )}
        </div>
      </div>
    </div>
  );
}
