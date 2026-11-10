/**
 * The island the town sits on: a round grassy plate on a dark rock plinth, a
 * river crossing the front, a cobbled square around the well, and low-poly trees
 * at the rim. Built so the whole thing reads as a model village on a table.
 */
import { diorama } from "./palette";
import { ISLAND_RADIUS, RIVER, TREES, type Vec2 } from "./layout";

function Tree({ x, z, scale }: { x: number; z: number; scale: number }) {
  return (
    <group position={[x, 0, z]} scale={scale}>
      <mesh position={[0, 0.35, 0]} castShadow>
        <cylinderGeometry args={[0.1, 0.14, 0.7, 6]} />
        <meshStandardMaterial color={diorama.timberDark} flatShading />
      </mesh>
      <mesh position={[0, 1.15, 0]} castShadow>
        <coneGeometry args={[0.6, 1.3, 7]} />
        <meshStandardMaterial color={diorama.meadowDark} flatShading />
      </mesh>
      <mesh position={[0, 1.65, 0]} castShadow>
        <coneGeometry args={[0.42, 0.9, 7]} />
        <meshStandardMaterial color={diorama.meadow} flatShading />
      </mesh>
    </group>
  );
}

/** One straight river segment between two points on the XZ plane. */
function RiverSegment({ a, b }: { a: Vec2; b: Vec2 }) {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const len = Math.hypot(dx, dz);
  const angle = Math.atan2(dz, dx);
  const mid: [number, number, number] = [(a[0] + b[0]) / 2, 0.06, (a[1] + b[1]) / 2];
  return (
    <mesh position={mid} rotation={[-Math.PI / 2, 0, -angle]} receiveShadow>
      <planeGeometry args={[len + 0.6, 1.5]} />
      <meshStandardMaterial color={diorama.river} metalness={0.1} roughness={0.35} />
    </mesh>
  );
}

export function Ground() {
  return (
    <group>
      {/* dark rock plinth */}
      <mesh position={[0, -0.75, 0]} receiveShadow>
        <cylinderGeometry args={[ISLAND_RADIUS + 0.4, ISLAND_RADIUS - 0.8, 1.5, 48]} />
        <meshStandardMaterial color={diorama.baseRock} flatShading />
      </mesh>
      {/* grassy top */}
      <mesh position={[0, 0.0, 0]} receiveShadow>
        <cylinderGeometry args={[ISLAND_RADIUS, ISLAND_RADIUS, 0.12, 48]} />
        <meshStandardMaterial color={diorama.meadow} flatShading />
      </mesh>

      {/* cobbled square around the well */}
      <mesh position={[0, 0.07, 0.2]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[2.4, 24]} />
        <meshStandardMaterial color={diorama.path} flatShading />
      </mesh>

      {/* river across the front */}
      {RIVER.slice(0, -1).map((a, i) => (
        <RiverSegment key={i} a={a} b={RIVER[i + 1]!} />
      ))}

      {/* trees at the rim */}
      {TREES.map(([x, z, s], i) => (
        <Tree key={i} x={x} z={z} scale={s} />
      ))}
    </group>
  );
}
