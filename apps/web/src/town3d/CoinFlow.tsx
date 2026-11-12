/**
 * The one bold element: gold coins arcing from a customer into your bakery when
 * the day makes a sale. This is the town's signature moment — the closed economy
 * made visible, a coin at a time. Coins fly along a short arc, spin, and land at
 * the counter.
 *
 * A fixed pool of coins is rendered once and animated imperatively (no per-frame
 * React state), so this costs almost nothing. It watches the live season: each
 * game day the bakery sells, it releases a few coins. Still under
 * prefers-reduced-motion (the Canvas runs frameloop "demand").
 */
import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Mesh } from "three";
import { useTownData } from "./townData";
import { diorama } from "./palette";
import { WORKSHOPS } from "./layout";

type Vec3 = [number, number, number];

const POOL = 18;
const DUR = 0.95; // seconds per coin
const APEX = 1.5; // how high the arc lifts

interface Slot {
  active: boolean;
  delay: number;
  t: number;
  from: Vec3;
  to: Vec3;
  spin: number;
}

function bezier(a: Vec3, b: Vec3, apexY: number, u: number): Vec3 {
  const inv = 1 - u;
  const cx = (a[0] + b[0]) / 2;
  const cy = Math.max(a[1], b[1]) + apexY;
  const cz = (a[2] + b[2]) / 2;
  return [
    inv * inv * a[0] + 2 * inv * u * cx + u * u * b[0],
    inv * inv * a[1] + 2 * inv * u * cy + u * u * b[1],
    inv * inv * a[2] + 2 * inv * u * cz + u * u * b[2],
  ];
}

export function CoinFlow() {
  const data = useTownData();
  const slots = useRef<Slot[]>(
    Array.from({ length: POOL }, () => ({ active: false, delay: 0, t: 0, from: [0, 0, 0], to: [0, 0, 0], spin: 0 })),
  );
  const meshes = useRef<(Mesh | null)[]>([]);
  const lastDay = useRef(data.day);

  // The player's bakery and the "customer" approach, in world space.
  const bakery = WORKSHOPS.find((w) => w.type === "bakery")!.pos;
  const toSquare = (() => {
    const len = Math.hypot(bakery[0], bakery[1]) || 1;
    return [-bakery[0] / len, -bakery[1] / len] as const; // unit vector toward the square
  })();

  useEffect(() => {
    if (data.day === lastDay.current) return;
    lastDay.current = data.day;
    const sold = data.soldToday;
    if (sold <= 0) return;

    const count = Math.max(1, Math.min(5, Math.round(sold)));
    let released = 0;
    for (const s of slots.current) {
      if (released >= count) break;
      if (s.active) continue;
      const lateral = (Math.random() - 0.5) * 0.8;
      // perpendicular to the approach, for a little spread
      const px = -toSquare[1];
      const pz = toSquare[0];
      const custX = bakery[0] + toSquare[0] * 1.8 + px * lateral;
      const custZ = bakery[1] + toSquare[1] * 1.8 + pz * lateral;
      const tgtX = bakery[0] + toSquare[0] * 0.45;
      const tgtZ = bakery[1] + toSquare[1] * 0.45;
      s.active = true;
      s.t = 0;
      s.delay = released * 0.14 + Math.random() * 0.05;
      s.from = [custX, 0.7, custZ];
      s.to = [tgtX, 1.3, tgtZ];
      s.spin = 8 + Math.random() * 6;
      released++;
    }
  }, [data.day, data.soldToday, bakery, toSquare]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    slots.current.forEach((s, i) => {
      const m = meshes.current[i];
      if (!m) return;
      if (!s.active) {
        m.visible = false;
        return;
      }
      if (s.delay > 0) {
        s.delay -= dt;
        m.visible = false;
        return;
      }
      s.t += dt / DUR;
      if (s.t >= 1) {
        s.active = false;
        m.visible = false;
        return;
      }
      const p = bezier(s.from, s.to, APEX, s.t);
      m.visible = true;
      m.position.set(p[0], p[1], p[2]);
      m.rotation.y += s.spin * dt;
      m.rotation.x = Math.PI / 2;
      const pop = s.t > 0.85 ? 1 - (s.t - 0.85) / 0.15 : 1; // tiny shrink as it lands
      m.scale.setScalar(0.6 + pop * 0.4);
    });
  });

  return (
    <group>
      {Array.from({ length: POOL }, (_, i) => (
        <mesh key={i} ref={(m) => (meshes.current[i] = m)} visible={false} castShadow>
          <cylinderGeometry args={[0.12, 0.12, 0.03, 12]} />
          <meshStandardMaterial
            color={diorama.wheat}
            emissive={diorama.wheatLight}
            emissiveIntensity={0.9}
            metalness={0.4}
            roughness={0.3}
            flatShading
          />
        </mesh>
      ))}
    </group>
  );
}
