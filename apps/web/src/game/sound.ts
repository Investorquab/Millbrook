/**
 * The town's voice — a tiny WebAudio sound engine. Every cue is synthesized in
 * code (oscillator + envelope), so there are no external audio assets: it is
 * CC0-by-construction, the same choice as the primitive-mesh diorama. Discrete
 * event cues only (a coin chime on a sale, a soft click, a two-note Game Master
 * cue) — no continuous ambient drone to wear out a demo.
 *
 * Browsers block audio until the first user gesture; the context is created
 * lazily and resumed on the first cue (which always follows a click in practice).
 * Everything is wrapped so audio can never throw into the app, and a persisted
 * mute (localStorage) drops the master gain to zero.
 */

const STORAGE_KEY = "millbrook.muted";
const VOLUME = 0.5;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = loadMuted();

function loadMuted(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function ensure(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    if (!ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : VOLUME;
      master.connect(ctx.destination);
    }
    if (ctx.state === "suspended") void ctx.resume().catch(() => {});
    return ctx;
  } catch {
    return null;
  }
}

export function isMuted(): boolean {
  return muted;
}

export function setMuted(next: boolean): void {
  muted = next;
  try {
    localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
  } catch {
    /* storage blocked — mute simply won't persist */
  }
  if (ctx && master) master.gain.setTargetAtTime(next ? 0 : VOLUME, ctx.currentTime, 0.02);
}

/** Flip mute and return the new state. */
export function toggleMuted(): boolean {
  setMuted(!muted);
  return muted;
}

/** One enveloped tone. `when` offsets the start (seconds) for small arpeggios. */
function tone(freq: number, dur: number, type: OscillatorType, gain: number, when = 0): void {
  const c = ensure();
  if (!c || !master) return;
  try {
    const t0 = c.currentTime + when;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  } catch {
    /* never let a cue break the app */
  }
}

/** A bright two-note "ching" when the bakery makes a sale. */
export function playCoin(): void {
  tone(1318.5, 0.18, "triangle", 0.3, 0); // E6
  tone(1975.5, 0.22, "triangle", 0.2, 0.05); // B6
}

/** A soft click for hiring and play. */
export function playClick(): void {
  tone(420, 0.06, "square", 0.1, 0);
}

/** A gentle two-note cue when the Game Master acts. */
export function playEvent(): void {
  tone(523.25, 0.3, "sine", 0.26, 0); // C5
  tone(783.99, 0.45, "sine", 0.2, 0.12); // G5
}
