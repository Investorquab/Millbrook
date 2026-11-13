import { useEffect, useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import { useSolo } from "../game/SoloProvider";
import "./FastForward.css";

/**
 * Fast-forward — ported from `design/screenshots/FastForward.png`. The town keeps
 * playing at full speed for about a game week while the charts fill in. Every
 * number here is live: the unemployment, wage and residents'-share lines come
 * straight from `session.metricsSeries()`, and the numbered "what happened"
 * markers are the week's real feed events (`session.seasonEvents()`).
 */

/** Real time between simulated days while fast-forwarding (ms). */
const STEP_MS = 190;
/** How many game days one fast-forward covers. */
const WEEK = 7;

interface ChartProps {
  days: number[];
  values: number[];
  color: string;
  yMin: number;
  yMax: number;
  yTicks: number[];
  formatTick: (v: number) => string;
  markers?: { day: number; n: number }[];
  height: number;
  label: string;
}

/** A small line chart in the design's coordinate space (viewBox 640×230). */
function Chart({ days, values, color, yMin, yMax, yTicks, formatTick, markers = [], height, label }: ChartProps) {
  const L = 40;
  const R = 600;
  const TOP = 30;
  const BOT = 190;
  const n = days.length;
  const x = (i: number) => (n <= 1 ? L : L + (i / (n - 1)) * (R - L));
  const y = (v: number) => BOT - ((v - yMin) / (yMax - yMin || 1)) * (BOT - TOP);
  const points = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const lastI = values.length - 1;

  const markerX = (day: number) => {
    const i = days.indexOf(day);
    return i >= 0 ? x(i) : null;
  };

  return (
    <svg viewBox="0 0 640 230" width="100%" height={height} role="img" aria-label={label} className="ff__chart">
      <g stroke="#46505c" strokeWidth="1">
        <path d={`M${L} ${BOT}H${R}`} />
        {yTicks.slice(1).map((t) => (
          <path key={t} d={`M${L} ${y(t).toFixed(1)}H${R}`} strokeDasharray="3 4" />
        ))}
      </g>
      <g fontFamily="Barlow Semi Condensed, sans-serif" fontSize="14" fill="#B9B2A4">
        {yTicks.map((t) => (
          <text key={t} x={L - 8} y={y(t) + 4} textAnchor="end">
            {formatTick(t)}
          </text>
        ))}
        {n > 0 && (
          <>
            <text x={L} y={BOT + 20} textAnchor="middle">
              Day {days[0]}
            </text>
            <text x={R} y={BOT + 20} textAnchor="middle">
              Day {days[lastI]}
            </text>
          </>
        )}
      </g>
      {markers.map(({ day }, i) => {
        const mx = markerX(day);
        return mx === null ? null : (
          <path key={`g${day}-${i}`} d={`M${mx.toFixed(1)} ${TOP}V${BOT}`} stroke="#B9B2A4" strokeWidth="1" strokeDasharray="3 3" />
        );
      })}
      {values.length > 0 && (
        <>
          <polyline points={points} fill="none" stroke={color} strokeWidth="3.5" strokeLinejoin="round" strokeLinecap="round" />
          <circle cx={x(lastI)} cy={y(values[lastI]!)} r="5" fill={color} />
        </>
      )}
      <g fontFamily="Barlow, sans-serif" fontSize="12" fontWeight="700" textAnchor="middle">
        {markers.map(({ day, n: num }, i) => {
          const mx = markerX(day);
          return mx === null ? null : (
            <g key={`m${day}-${i}`}>
              <circle cx={mx} cy={TOP - 8} r="9" fill="#EDE6D6" />
              <text x={mx} y={TOP - 4} fill="#2F3640">
                {num}
              </text>
            </g>
          );
        })}
      </g>
    </svg>
  );
}

export function FastForward() {
  const { session, view, pause, stepOnce } = useSolo();
  const startRef = useRef({ day: view.day, coins: view.coins });
  const targetRef = useRef(Math.min(view.day + WEEK, view.totalDays));

  // Fast-forward autonomously up to a week (or the end of the season). Stepping
  // through the provider keeps the shared `view` — and this screen — in sync.
  useEffect(() => {
    pause(); // take over the clock from the town's play loop
    const id = setInterval(() => {
      const now = session.view();
      if (now.day >= targetRef.current || now.ended) {
        clearInterval(id);
        return;
      }
      stepOnce();
    }, STEP_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const series = session.metricsSeries();
  const events = session.seasonEvents(3);
  const markers = events.map((e, i) => ({ day: e.day, n: i + 1 }));

  const start = startRef.current;
  const target = targetRef.current;
  const progress = target > start.day ? Math.min(1, (view.day - start.day) / (target - start.day)) : 1;

  const latestUnemp = series.unemployment.at(-1) ?? view.unemploymentPct;
  const unempMax = Math.max(25, Math.ceil((Math.max(0, ...series.unemployment) + 2) / 5) * 5);

  const wageVals = series.avgWage;
  const wageLo = Math.floor(Math.min(6, ...(wageVals.length ? wageVals : [6])));
  const wageHi = Math.ceil(Math.max(8, ...(wageVals.length ? wageVals : [8])));

  const shareVals = series.residentShare;
  const shareLo = Math.max(0, Math.floor((Math.min(...(shareVals.length ? shareVals : [20])) - 4) / 5) * 5);
  const shareHi = Math.ceil((Math.max(...(shareVals.length ? shareVals : [40])) + 4) / 5) * 5;

  const weekProfit = view.coins - start.coins;

  const ticks = useMemo(() => {
    const unemp = [0, unempMax / 2, unempMax];
    return { unemp };
  }, [unempMax]);

  return (
    <div className="ff">
      <div className="ff__backdrop" aria-hidden="true">
        <img src="/art/town.svg" alt="" />
      </div>

      <header className="ff__header">
        <div className="ff__title">
          <h1>Fast-forwarding a week</h1>
          <span>The town keeps playing at full speed while you watch. Seed 42.</span>
        </div>
        <div className="ff__progress">
          <div className="ff__progress-labels">
            <span>Day {start.day}</span>
            <span className="ff__progress-now">Day {view.day}</span>
            <span>Day {target}</span>
          </div>
          <div
            className="ff__progress-track"
            role="progressbar"
            aria-label="Fast-forward progress"
            aria-valuemin={start.day}
            aria-valuemax={target}
            aria-valuenow={view.day}
          >
            <span style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
        </div>
        <div className="ff__actions">
          <Link to="/play" className="ff__btn">
            Stop and go to town
          </Link>
          <Link to="/scoreboard" className="ff__btn ff__btn--primary">
            Skip to season end
          </Link>
        </div>
      </header>

      <div className="ff__grid">
        <section className="ff__panel ff__panel--hero" aria-label="Unemployment">
          <div className="ff__panel-head">
            <h2>Unemployment over the season, with the week's events marked</h2>
            <span className="ff__stat" style={{ color: "var(--madder-text)" }}>
              {latestUnemp}%
            </span>
          </div>
          <Chart
            days={series.days}
            values={series.unemployment}
            color="#E58A94"
            yMin={0}
            yMax={unempMax}
            yTicks={ticks.unemp}
            formatTick={(v) => `${Math.round(v)}%`}
            markers={markers}
            height={300}
            label={`Unemployment by day, now ${latestUnemp}%`}
          />
        </section>

        <aside className="ff__panel ff__panel--log" aria-label="What happened">
          <h2 className="ff__log-title">What happened</h2>
          {events.length > 0 ? (
            <ol className="ff__log">
              {events.map((e, i) => (
                <li key={`${e.day}-${i}`}>
                  <span className="ff__log-num">{i + 1}</span>
                  <span>
                    <b>Day {e.day}.</b> {e.text}
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="ff__log-empty">A calm week — no strikes, layoffs or shocks. Watch the lines settle.</p>
          )}
          <div className="ff__bakery">
            <span className="ff__bakery-label">Your bakery this week</span>
            <div className="ff__bakery-grid">
              <span>
                <span className="ff__bakery-cap">Profit</span>
                <b className={weekProfit >= 0 ? "pos" : "neg"}>
                  {weekProfit >= 0 ? "+" : ""}
                  {weekProfit.toLocaleString()}
                </b>
              </span>
              <span>
                <span className="ff__bakery-cap">Workers kept</span>
                <b>
                  {view.workers.length} of {view.maxWorkers}
                </b>
              </span>
            </div>
            <span className="ff__bakery-note">
              {view.onStrike
                ? "Your workers are on strike — no bread is leaving the counter."
                : `Bread at ${view.price} coins, wages at ${view.wage}. ${view.wageReason}`}
            </span>
          </div>
        </aside>

        <section className="ff__panel" aria-label="Average wage">
          <h3>Average wage across the town</h3>
          <Chart
            days={series.days}
            values={series.avgWage}
            color="#D9A441"
            yMin={wageLo}
            yMax={wageHi}
            yTicks={[wageLo, (wageLo + wageHi) / 2, wageHi]}
            formatTick={(v) => (Number.isInteger(v) ? `${v}` : v.toFixed(1))}
            height={150}
            label="Average wage by day"
          />
          <p>When a rival cuts wages, others follow for a day or two — then workers leave for better-paying shops and the average comes back.</p>
        </section>

        <section className="ff__panel" aria-label="Residents' share of money">
          <h3>Residents' share of the town's 10,000 coins</h3>
          <Chart
            days={series.days}
            values={series.residentShare}
            color="#6E9B5A"
            yMin={shareLo}
            yMax={shareHi}
            yTicks={[shareLo, (shareLo + shareHi) / 2, shareHi]}
            formatTick={(v) => `${Math.round(v)}%`}
            height={150}
            label="Residents' share of all coins by day"
          />
          <p>Less money in residents' pockets means fewer sales for every shop — yours included. It never leaves town; it only changes hands.</p>
        </section>
      </div>
    </div>
  );
}
