/**
 * The townsfolk. Each resident is a small low-poly figure in a trade outfit who
 * walks between their workplace and a home, pausing at each end — bakers near
 * the bakery, miners by the mine, farmers in the fields, the idle unemployed
 * around the well. The AI owners pace by their own shops with signature
 * silhouettes (Gus's tall hat, Rita's bright coat). Legs swing while walking;
 * everyone idles when paused.
 *
 * The strolling is ambient life, decoupled from the economy clock (so the town
 * feels alive even before you press play); where each person belongs is read
 * live from the simulation. Capped well under the ~40-character budget, and the
 * whole layer goes still under prefers-reduced-motion (frameloop "demand").
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import type { Group } from "three";
import { COOP_ID, type WorkshopType } from "@millbrook/shared";
import { rules } from "@millbrook/economy";
import { useSolo } from "../game/SoloProvider";
import { diorama, tradeColor } from "./palette";
import { COOP, HOUSES, MINE, TOWN_HALL, WELL, WORKSHOPS, type Vec2 } from "./layout";
import "./Residents.css";

const SKIN = ["#e4b58e", "#c88e63", "#a56a40", "#8a5635"];
const MAX_FIGURES = 16;

/** How many residents murmur a reason at once, and how long each one dwells. */
const BUBBLES_AT_ONCE = 2;
const BUBBLE_DWELL_MS = 3800;

const reducedMotion =
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Trim a reason to one tidy line for the bubble. */
function shortReason(text: string): string {
  const t = text.trim();
  return t.length > 52 ? `${t.slice(0, 51).trimEnd()}…` : t;
}

type OwnerKey = "gus" | "fern" | "sam" | "rita";

/** Stable 0..1 pseudo-random from a string id. */
function hash01(id: string, salt = 0): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return ((h >>> 0) % 1000) / 1000;
}

/** Offset a point by a deterministic small amount, so figures don't stack. */
function jitter(p: Vec2, seed: string, salt: number, spread: number): Vec2 {
  const a = hash01(seed, salt) * Math.PI * 2;
  const d = 0.3 + hash01(seed, salt + 9) * spread;
  return [p[0] + Math.cos(a) * d, p[1] + Math.sin(a) * d];
}

interface FigureProps {
  /** Ping-pong path: the figure ambles between these points. */
  waypoints: [Vec2, Vec2];
  seed: string;
  outfit: string;
  owner?: OwnerKey;
  /** When set, a speech bubble floats above this figure with their reason. */
  bubble?: string;
}

function Person({ waypoints, seed, outfit, owner, bubble }: FigureProps) {
  const ref = useRef<Group>(null);
  const legL = useRef<Group>(null);
  const legR = useRef<Group>(null);
  const skin = SKIN[Math.floor(hash01(seed, 4) * SKIN.length)]!;
  const speed = 0.7 + hash01(seed, 5) * 0.6;
  const pauseDur = 1.4 + hash01(seed, 6) * 2.6;

  // Mutable walk state (not React state — mutated every frame).
  const walk = useRef({
    i: 0,
    p: hash01(seed, 7), // start somewhere along the path
    mode: "move" as "move" | "pause",
    timer: hash01(seed, 8) * pauseDur,
    heading: 0,
    phase: hash01(seed, 1) * 6.28,
  });

  useFrame((state, delta) => {
    const g = ref.current;
    if (!g) return;
    const w = walk.current;
    const dt = Math.min(delta, 0.05);
    const a = w.i === 0 ? waypoints[0] : waypoints[1];
    const b = w.i === 0 ? waypoints[1] : waypoints[0];
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const len = Math.max(0.001, Math.hypot(dx, dz));

    let moving = false;
    let x = a[0];
    let z = a[1];
    if (w.mode === "move") {
      moving = true;
      w.p += (speed * dt) / len;
      if (w.p >= 1) {
        w.p = 1;
        w.mode = "pause";
        w.timer = pauseDur;
      }
      x = a[0] + dx * w.p;
      z = a[1] + dz * w.p;
      w.heading = Math.atan2(dx, dz); // face direction of travel (model front is +z)
    } else {
      x = b[0];
      z = b[1];
      w.timer -= dt;
      if (w.timer <= 0) {
        w.i = (w.i + 1) % 2;
        w.p = 0;
        w.mode = "move";
      }
    }

    const t = state.clock.elapsedTime;
    const stride = moving ? Math.sin(t * 7 + w.phase) : 0;
    g.position.set(x, moving ? Math.abs(Math.sin(t * 7 + w.phase)) * 0.03 : 0, z);
    g.rotation.y = w.heading;
    if (legL.current) legL.current.rotation.x = stride * 0.7;
    if (legR.current) legR.current.rotation.x = -stride * 0.7;
  });

  const hatColor = owner === "rita" ? "#e06a2c" : owner === "gus" ? "#1f242b" : outfit;

  return (
    <group ref={ref} scale={0.72}>
      {/* legs (pivot at the hip so they swing) */}
      <group ref={legL} position={[-0.09, 0.44, 0]}>
        <mesh position={[0, -0.22, 0]} castShadow>
          <boxGeometry args={[0.12, 0.44, 0.13]} />
          <meshStandardMaterial color={diorama.timberDark} flatShading />
        </mesh>
      </group>
      <group ref={legR} position={[0.09, 0.44, 0]}>
        <mesh position={[0, -0.22, 0]} castShadow>
          <boxGeometry args={[0.12, 0.44, 0.13]} />
          <meshStandardMaterial color={diorama.timberDark} flatShading />
        </mesh>
      </group>
      {/* torso / coat */}
      <mesh position={[0, 0.66, 0]} castShadow>
        <boxGeometry args={[0.36, 0.5, 0.24]} />
        <meshStandardMaterial color={owner === "rita" ? "#e06a2c" : outfit} flatShading />
      </mesh>
      {/* apron / shawl accent */}
      {(owner === "fern" || !owner) && (
        <mesh position={[0, 0.6, 0.13]}>
          <boxGeometry args={[0.3, 0.34, 0.03]} />
          <meshStandardMaterial color={owner === "fern" ? "#6e9b5a" : diorama.plaster} flatShading />
        </mesh>
      )}
      {/* head */}
      <mesh position={[0, 1.02, 0]} castShadow>
        <boxGeometry args={[0.26, 0.26, 0.26]} />
        <meshStandardMaterial color={skin} flatShading />
      </mesh>
      {/* hat — the silhouette cue */}
      {owner === "gus" ? (
        <group position={[0, 1.18, 0]}>
          <mesh position={[0, 0.02, 0]} castShadow>
            <cylinderGeometry args={[0.24, 0.24, 0.04, 10]} />
            <meshStandardMaterial color="#1f242b" flatShading />
          </mesh>
          <mesh position={[0, 0.24, 0]} castShadow>
            <cylinderGeometry args={[0.15, 0.15, 0.42, 10]} />
            <meshStandardMaterial color="#1f242b" flatShading />
          </mesh>
        </group>
      ) : (
        <mesh position={[0, 1.2, 0]} castShadow>
          <coneGeometry args={[0.2, 0.18, 8]} />
          <meshStandardMaterial color={hatColor} flatShading />
        </mesh>
      )}
      {bubble && (
        <Html position={[0, 2.35, 0]} center zIndexRange={[60, 0]} pointerEvents="none">
          <div className="town3d-bubble">{bubble}</div>
        </Html>
      )}
    </group>
  );
}

export function Residents() {
  const { session, view } = useSolo();
  void view.day; // re-place as the season advances (employment can change)

  const { owners, folk } = useMemo(() => {
    const world = session.world;

    const byType = new Map<WorkshopType, Vec2>(WORKSHOPS.map((w) => [w.type, w.pos]));
    const shopAnchor = new Map<string, { pos: Vec2; type: WorkshopType }>();
    for (const w of world.workshops.values()) {
      const pos = byType.get(w.type);
      if (pos) shopAnchor.set(w.id, { pos, type: w.type });
    }

    const anchorFor = (employerId: string | null): { pos: Vec2; outfit: string } => {
      if (employerId === null) return { pos: WELL, outfit: diorama.plasterWarm };
      if (employerId === rules.TOWN_HALL_PUBLIC_WORKS_EMPLOYER)
        return { pos: [TOWN_HALL.pos[0], TOWN_HALL.pos[1] + 2.2], outfit: tradeColor.townhall };
      if (employerId === COOP_ID) return { pos: COOP.fields[0]!.pos, outfit: tradeColor.coop };
      const shop = shopAnchor.get(employerId);
      if (shop) return { pos: shop.pos, outfit: tradeColor[shop.type as keyof typeof tradeColor] ?? diorama.plaster };
      return { pos: WELL, outfit: diorama.plasterWarm };
    };

    const owners: { key: OwnerKey; waypoints: [Vec2, Vec2]; outfit: string }[] = [];
    for (const o of world.owners.values()) {
      if (!o.strategy) continue; // skip the player
      const shop = shopAnchor.get(o.workshopId);
      if (!shop) continue;
      const outfit = tradeColor[shop.type as keyof typeof tradeColor] ?? diorama.plaster;
      // Owners pace a short beat outside their own shop.
      owners.push({
        key: o.strategy as OwnerKey,
        waypoints: [jitter(shop.pos, `o-${o.strategy}`, 1, 0.4), jitter(shop.pos, `o-${o.strategy}`, 3, 0.7)],
        outfit,
      });
    }

    const alive = rules.aliveResidents(world).slice(0, MAX_FIGURES);
    const folk = alive.map((r) => {
      const a = anchorFor(r.employerId);
      const home = HOUSES[Math.floor(hash01(r.id, 0) * HOUSES.length)]!.pos;
      // Amble between their workplace and a home; the unemployed between the
      // well and a home. A touch of jitter so paths don't overlap exactly.
      const work = jitter(a.pos, r.id, 11, 1.0);
      const rest = jitter(home, r.id, 13, 0.7);
      return {
        id: r.id,
        waypoints: [work, rest] as [Vec2, Vec2],
        outfit: a.outfit,
        reason: shortReason(r.lastReason),
      };
    });

    return { owners, folk };
  }, [session, view.day]);

  // A couple of residents murmur their reason at a time, cycling slowly so the
  // whole town gets a turn. Reasons come straight from the rules (`lastReason`).
  const [cycle, setCycle] = useState(0);
  useEffect(() => {
    if (reducedMotion) return; // keep a static pair under reduced motion
    const id = setInterval(() => setCycle((c) => c + 1), BUBBLE_DWELL_MS);
    return () => clearInterval(id);
  }, []);
  // Repaint when the pair changes, so bubbles reposition under the "demand"
  // frameloop that reduced-motion uses.
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    invalidate();
  }, [cycle, invalidate]);

  const speaking = useMemo(() => {
    const idx = new Set<number>();
    const n = folk.length;
    if (n > 0) {
      const base = ((cycle % n) + n) % n;
      idx.add(base);
      for (let k = 1; k < Math.min(BUBBLES_AT_ONCE, n); k++) {
        idx.add((base + Math.floor((k * n) / BUBBLES_AT_ONCE)) % n);
      }
    }
    return idx;
  }, [cycle, folk.length]);

  return (
    <group>
      {folk.map((f, i) => (
        <Person
          key={f.id}
          waypoints={f.waypoints}
          seed={f.id}
          outfit={f.outfit}
          bubble={speaking.has(i) ? f.reason : undefined}
        />
      ))}
      {owners.map((o) => (
        <Person key={`owner-${o.key}`} waypoints={o.waypoints} seed={`owner-${o.key}`} outfit={o.outfit} owner={o.key} />
      ))}
      {/* a couple of miners pacing by the mine */}
      <Person waypoints={[jitter(MINE.pos, "miner-1", 1, 0.5), jitter(MINE.pos, "miner-1", 4, 0.9)]} seed="miner-1" outfit={tradeColor.mine} />
      <Person waypoints={[jitter(MINE.pos, "miner-2", 2, 0.6), jitter(MINE.pos, "miner-2", 5, 1.0)]} seed="miner-2" outfit={tradeColor.mine} />
    </group>
  );
}
