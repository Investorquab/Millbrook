/**
 * Low-poly building blocks for the diorama, built from three primitives with
 * flat shading so they read as a carved wooden model village. Every workshop has
 * a distinct silhouette and trade colour; busy shops show smoke or a forge glow,
 * bankrupt ones board up — the simulation's state is visible in the world.
 */
import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group, Mesh } from "three";
import type { WorkshopType } from "@millbrook/shared";
import { diorama, tradeColor } from "./palette";
import { lampMaterial } from "./lamps";
import type { Vec2 } from "./layout";

const xz = (p: Vec2, y = 0): [number, number, number] => [p[0], y, p[1]];

/** A drifting puff of smoke/steam above a busy building. */
function Smoke({ x, z, y, tint = diorama.smoke }: { x: number; z: number; y: number; tint?: string }) {
  const ref = useRef<Group>(null);
  useFrame((state) => {
    const g = ref.current;
    if (!g) return;
    const t = state.clock.elapsedTime;
    g.children.forEach((child, i) => {
      const phase = (t * 0.5 + i * 0.6) % 2; // 0..2 loop
      child.position.y = phase * 0.9;
      child.position.x = Math.sin(t * 0.8 + i) * 0.12;
      const s = 0.18 + phase * 0.22;
      child.scale.setScalar(s);
      // fade as it rises
      const m = (child as Mesh).material as { opacity: number };
      m.opacity = Math.max(0, 0.5 - phase * 0.25);
    });
  });
  return (
    <group ref={ref} position={[x, y, z]}>
      {[0, 1, 2].map((i) => (
        <mesh key={i}>
          <icosahedronGeometry args={[1, 0]} />
          <meshStandardMaterial color={tint} transparent opacity={0.4} flatShading />
        </mesh>
      ))}
    </group>
  );
}

function Roof({
  w,
  d,
  h,
  y,
  color,
  rotY = 0,
}: {
  w: number;
  d: number;
  h: number;
  y: number;
  color: string;
  rotY?: number;
}) {
  // A hipped roof from a stretched 4-sided cone.
  return (
    <mesh position={[0, y, 0]} rotation={[0, Math.PI / 4 + rotY, 0]} castShadow>
      <coneGeometry args={[Math.max(w, d) * 0.78, h, 4]} />
      <meshStandardMaterial color={color} flatShading />
    </mesh>
  );
}

function Sign({ color, y }: { color: string; y: number }) {
  // A small hanging trade sign — colour says the trade from across the square.
  return (
    <mesh position={[0, y, 0.95]} castShadow>
      <boxGeometry args={[0.5, 0.5, 0.08]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.15} flatShading />
    </mesh>
  );
}

interface WorkshopProps {
  type: WorkshopType;
  pos: Vec2;
  rot: number;
  busy?: boolean;
  bankrupt?: boolean;
  onStrike?: boolean;
  isPlayer?: boolean;
}

/** One workshop. The body is shared; roof, colour and props vary by trade. */
export function Workshop({ type, pos, rot, busy, bankrupt, isPlayer }: WorkshopProps) {
  const accent = tradeColor[type as keyof typeof tradeColor] ?? diorama.wheat;
  const roofColor =
    type === "smithy" ? diorama.roofSlate : type === "weaver" ? diorama.roofClay : diorama.roofThatch;
  const bodyColor = isPlayer ? diorama.plaster : diorama.plasterWarm;

  return (
    <group position={xz(pos)} rotation={[0, rot, 0]}>
      {/* stone footing + plaster body */}
      <mesh position={[0, 0.12, 0]} receiveShadow castShadow>
        <boxGeometry args={[2.0, 0.24, 1.7]} />
        <meshStandardMaterial color={diorama.stoneDark} flatShading />
      </mesh>
      <mesh position={[0, 0.72, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.8, 1.0, 1.5]} />
        <meshStandardMaterial color={bodyColor} flatShading />
      </mesh>
      {/* corner timbers */}
      {[-0.86, 0.86].map((x) => (
        <mesh key={x} position={[x, 0.72, 0.76]} castShadow>
          <boxGeometry args={[0.14, 1.0, 0.14]} />
          <meshStandardMaterial color={diorama.timber} flatShading />
        </mesh>
      ))}
      {/* door */}
      <mesh position={[0, 0.5, 0.76]}>
        <boxGeometry args={[0.5, 0.72, 0.06]} />
        <meshStandardMaterial color={bankrupt ? diorama.timberDark : diorama.timber} flatShading />
      </mesh>
      <Roof w={2.0} d={1.7} h={1.0} y={1.72} color={roofColor} />
      <Sign color={bankrupt ? diorama.stoneDark : accent} y={1.15} />

      {/* a lit window (shared lamp material, so it dims by day and glows at
          night), or boarded dark when bankrupt */}
      {bankrupt ? (
        <mesh position={[0.5, 0.78, 0.77]}>
          <boxGeometry args={[0.34, 0.34, 0.04]} />
          <meshStandardMaterial color={diorama.timberDark} emissive="#000" emissiveIntensity={0} flatShading />
        </mesh>
      ) : (
        <mesh position={[0.5, 0.78, 0.77]} material={lampMaterial}>
          <boxGeometry args={[0.34, 0.34, 0.04]} />
        </mesh>
      )}

      {/* trade props */}
      {type === "bakery" && (
        <mesh position={[0.6, 1.9, -0.2]} castShadow>
          <cylinderGeometry args={[0.16, 0.18, 0.7, 6]} />
          <meshStandardMaterial color={diorama.stone} flatShading />
        </mesh>
      )}
      {type === "smithy" && (
        <mesh position={[0, 0.62, 1.0]}>
          <boxGeometry args={[0.6, 0.5, 0.3]} />
          <meshStandardMaterial
            color={diorama.smithyGlow}
            emissive={diorama.smithyGlow}
            emissiveIntensity={busy ? 1.1 : 0.4}
            flatShading
          />
        </mesh>
      )}
      {type === "brewery" &&
        [-0.5, 0.0, 0.5].map((x) => (
          <mesh key={x} position={[x, 0.3, 1.05]} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <cylinderGeometry args={[0.22, 0.22, 0.42, 8]} />
            <meshStandardMaterial color={diorama.timber} flatShading />
          </mesh>
        ))}
      {type === "weaver" && (
        <mesh position={[0, 1.28, 0.95]} rotation={[0.5, 0, 0]} castShadow>
          <boxGeometry args={[1.5, 0.05, 0.7]} />
          <meshStandardMaterial color={accent} flatShading />
        </mesh>
      )}

      {/* smoke from the chimney when the shop is working */}
      {busy && !bankrupt && (
        <Smoke x={type === "bakery" ? 0.6 : 0} z={type === "bakery" ? -0.2 : 0} y={2.3} />
      )}
    </group>
  );
}

/** The Town Hall — the biggest building, a clock gable and a little bell tower. */
export function TownHall({ pos, rot }: { pos: Vec2; rot: number }) {
  return (
    <group position={xz(pos)} rotation={[0, rot, 0]}>
      <mesh position={[0, 0.15, 0]} receiveShadow castShadow>
        <boxGeometry args={[3.2, 0.3, 2.2]} />
        <meshStandardMaterial color={diorama.stone} flatShading />
      </mesh>
      <mesh position={[0, 1.1, 0]} castShadow receiveShadow>
        <boxGeometry args={[2.8, 1.5, 1.9]} />
        <meshStandardMaterial color={diorama.plaster} flatShading />
      </mesh>
      {/* columns */}
      {[-1.1, -0.37, 0.37, 1.1].map((x) => (
        <mesh key={x} position={[x, 0.95, 1.0]} castShadow>
          <cylinderGeometry args={[0.13, 0.13, 1.4, 8]} />
          <meshStandardMaterial color={diorama.plasterWarm} flatShading />
        </mesh>
      ))}
      <mesh position={[0, 1.95, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
        <coneGeometry args={[2.3, 0.9, 4]} />
        <meshStandardMaterial color={diorama.roofSlate} flatShading />
      </mesh>
      {/* bell tower */}
      <mesh position={[0, 2.5, -0.2]} castShadow>
        <boxGeometry args={[0.7, 0.9, 0.7]} />
        <meshStandardMaterial color={diorama.plaster} flatShading />
      </mesh>
      <mesh position={[0, 3.15, -0.2]} rotation={[0, Math.PI / 4, 0]} castShadow>
        <coneGeometry args={[0.6, 0.6, 4]} />
        <meshStandardMaterial color={diorama.wheat} flatShading />
      </mesh>
      {/* clock face — lit like a lamp, so it reads after dark */}
      <mesh position={[0, 1.35, 0.96]} material={lampMaterial}>
        <circleGeometry args={[0.28, 16]} />
      </mesh>
    </group>
  );
}

/** The mine: a timbered portal in a rocky rise, with a minecart. */
export function Mine({ pos, rot }: { pos: Vec2; rot: number }) {
  return (
    <group position={xz(pos)} rotation={[0, rot, 0]}>
      <mesh position={[0, 0.9, 0]} castShadow receiveShadow>
        <dodecahedronGeometry args={[1.5, 0]} />
        <meshStandardMaterial color={diorama.stone} flatShading />
      </mesh>
      <mesh position={[0, 0.6, 1.2]}>
        <boxGeometry args={[0.9, 1.1, 0.4]} />
        <meshStandardMaterial color={diorama.timberDark} flatShading />
      </mesh>
      <mesh position={[0, 0.55, 1.32]}>
        <boxGeometry args={[0.6, 0.8, 0.2]} />
        <meshStandardMaterial color="#13181d" flatShading />
      </mesh>
      {/* minecart */}
      <mesh position={[1.1, 0.25, 1.6]} castShadow>
        <boxGeometry args={[0.5, 0.3, 0.34]} />
        <meshStandardMaterial color={diorama.timber} flatShading />
      </mesh>
    </group>
  );
}

const HOUSE_TONES = [diorama.plaster, diorama.plasterWarm, "#cdb48c"];

/** A little home. */
export function House({ pos, rot, tone }: { pos: Vec2; rot: number; tone: number }) {
  return (
    <group position={xz(pos)} rotation={[0, rot, 0]}>
      <mesh position={[0, 0.5, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.2, 0.9, 1.1]} />
        <meshStandardMaterial color={HOUSE_TONES[tone % HOUSE_TONES.length]} flatShading />
      </mesh>
      <mesh position={[0, 1.15, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
        <coneGeometry args={[1.0, 0.7, 4]} />
        <meshStandardMaterial color={diorama.roofClay} flatShading />
      </mesh>
      <mesh position={[0, 0.34, 0.56]}>
        <boxGeometry args={[0.3, 0.5, 0.05]} />
        <meshStandardMaterial color={diorama.timber} flatShading />
      </mesh>
      <mesh position={[0.35, 0.6, 0.56]} material={lampMaterial}>
        <boxGeometry args={[0.24, 0.24, 0.04]} />
      </mesh>
    </group>
  );
}

/** The well at the centre of the square. */
export function Well({ pos }: { pos: Vec2 }) {
  return (
    <group position={xz(pos)}>
      <mesh position={[0, 0.25, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.5, 0.55, 0.5, 10]} />
        <meshStandardMaterial color={diorama.stone} flatShading />
      </mesh>
      <mesh position={[0, 0.48, 0]}>
        <cylinderGeometry args={[0.42, 0.42, 0.06, 10]} />
        <meshStandardMaterial color={diorama.riverDeep} />
      </mesh>
      {[-0.45, 0.45].map((x) => (
        <mesh key={x} position={[x, 0.85, 0]} castShadow>
          <boxGeometry args={[0.1, 1.2, 0.1]} />
          <meshStandardMaterial color={diorama.timber} flatShading />
        </mesh>
      ))}
      <mesh position={[0, 1.5, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
        <coneGeometry args={[0.6, 0.4, 4]} />
        <meshStandardMaterial color={diorama.roofThatch} flatShading />
      </mesh>
    </group>
  );
}

/** A Co-op barn. */
export function Barn({ pos, rot }: { pos: Vec2; rot: number }) {
  return (
    <group position={xz(pos)} rotation={[0, rot, 0]}>
      <mesh position={[0, 0.55, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.8, 1.1, 1.3]} />
        <meshStandardMaterial color={diorama.roofClay} flatShading />
      </mesh>
      <mesh position={[0, 1.35, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
        <coneGeometry args={[1.5, 0.7, 4]} />
        <meshStandardMaterial color={diorama.timberDark} flatShading />
      </mesh>
    </group>
  );
}

/** A tilled field strip (wheat gold or cotton pale). */
export function Field({ pos, crop }: { pos: Vec2; crop: "wheat" | "cotton" }) {
  const color = crop === "wheat" ? diorama.field : "#cdbfa0";
  return (
    <group position={xz(pos, 0.02)}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[1.8, 1.4]} />
        <meshStandardMaterial color={color} flatShading />
      </mesh>
      {[-0.5, -0.1, 0.3, 0.7].map((z) => (
        <mesh key={z} position={[0, 0.08, z - 0.1]} castShadow>
          <boxGeometry args={[1.6, 0.16, 0.08]} />
          <meshStandardMaterial color={crop === "wheat" ? diorama.wheat : "#e7e0d0"} flatShading />
        </mesh>
      ))}
    </group>
  );
}
