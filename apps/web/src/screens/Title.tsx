import { Link } from "react-router-dom";
import { Button, PlayArrow } from "../components/Button";
import { color } from "../theme/tokens";
import "./Title.css";

/**
 * Title screen — ported from `design/screenshots/Main.png`. The miniature town
 * is the hero; the interface is a quiet frame. Guest "Play solo" starts a solo
 * season. Copy and tokens are taken verbatim from the approved design.
 */
export function Title() {
  return (
    <div className="title">
      <div className="title__scene">
        <img src="/art/town.svg" alt="Millbrook, a miniature town on a wooden plinth at dusk" />
      </div>
      <div className="title__scrim" />

      <header className="title__topbar">
        <Link to="/signin" className="title__signin">
          Sign in
        </Link>
      </header>

      <main className="title__content">
        <h1 className="title__wordmark">Millbrook</h1>
        <p className="title__tagline">
          Your workers are your only customers. Pay them too little and nobody can afford your bread.
        </p>
        <div className="title__actions">
          <Button to="/play" variant="primary" trailing={<PlayArrow />} ariaLabel="Play solo">
            Play solo
          </Button>
          <Button to="/host">Host a room</Button>
          <Button to="/join">Join with a code</Button>
        </div>
      </main>

      <div className="title__bubble" aria-hidden="true">
        <div className="title__bubble-body">Bread's 3 coins today. I can afford it.</div>
        <svg className="title__bubble-tail" width="18" height="12" viewBox="0 0 18 12">
          <path d="M0 0h18L9 12z" fill={color.linen} />
        </svg>
      </div>

      <div className="title__cast" aria-hidden="true">
        <img className="gus" src="/art/char-gus.svg" alt="" />
        <img className="fern" src="/art/char-fern.svg" alt="" />
      </div>

      <footer className="title__footer">
        A game for the NEAR HACKATHON. Ten thousand coins, fixed forever.
      </footer>
    </div>
  );
}
