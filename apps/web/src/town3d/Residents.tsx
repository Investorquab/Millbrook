/**
 * The townsfolk. Each resident is a small low-poly figure in a trade outfit,
 * placed where the simulation has them: bakers by the bakery, miners by the
 * mine, farmers in the Co-op fields, the idle unemployed by the well. The AI
 * owners get signature silhouettes (Gus's tall hat, Sam's plain cap, Rita's
 * bright coat). Figures idle-bob; full walking paths come next.
 *
 * Reads the shared world directly (like the Proof screen) so the crowd reflects
 * the live season. Capped so we stay well under ~40 animated characters.
 */
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group } from "three";
import { COOP_ID, type WorkshopType } from "@millbrook/shared";
import { rules } from "@millbrook/economy";
import { useSolo } from "../game/SoloProvider";
import { diorama, tradeColor } from "./palette";
import { COOP, MINE, TOWN_HALL, WELL, WORKSHOPS, type Vec2 } from "./layout";

const SKIN = ["#e4b58e", "#c88e63", "#a56a40", "#8a5635"];
const MAX_FIGURES = 16;

type OwnerKey = "gus" | "fern" | "sam" | "rita";

/** Stable 0..1 pseudo-random from a string id. */
function hash01(id: string, salt = 0): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return ((h >>> 0) % 1000) / 1000;
}

interface FigureProps {
  anchor: Vec2;
  seed: string;
  outfit: string;
  owner?: OwnerKey;
  spread?: number;
}

function Person({ anchor, seed, outfit, owner, spread = 1.1 }: FigureProps) {
  const ref = useRef<Group>(null);
  const r1 = hash01(seed, 1);
  const r2 = hash01(seed, 2);
  const angle = r1 * Math.PI * 2;
  const dist = owner ? 1.5 : 0.7 + r2 * spread;
  const x = anchor[0] + Math.cos(angle) * dist;
  const z = anchor[1] + Math.sin(angle) * dist;
  const facing = hash01(seed, 3) * Math.PI * 2;
  const skin = SKIN[Math.floor(hash01(seed, 4) * SKIN.length)]!;
  const phase = r1 * 6.28;

  useFrame((state) => {
    const g = ref.current;
    if (!g) return;
    const t = state.clock.elapsedTime;
    g.position.y = Math.abs(Math.sin(t * 1.6 + phase)) * 0.04; // gentle idle bob
    g.rotation.y = facing + Math.sin(t * 0.5 + phase) * 0.15;
  });

  const hatColor = owner === "rita" ? "#e06a2c" : owner === "gus" ? "#1f242b" : outfit;

  return (
    <group position={[x, 0, z]} scale={0.72}>
      <group ref={ref}>
        {/* legs */}
        {[-0.09, 0.09].map((lx) => (
          <mesh key={lx} position={[lx, 0.22, 0]} castShadow>
            <boxGeometry args={[0.12, 0.44, 0.13]} />
            <meshStandardMaterial color={diorama.timberDark} flatShading />
          </mesh>
        ))}
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
          <group position={[0, 1.28, 0]}>
            <mesh castShadow>
              <cylinderGeometry args={[0.02, 0.02, 0.0, 6]} />
            </mesh>
            <mesh position={[0, 0.02, 0]} castShadow>
              <cylinderGeometry args={[0.24, 0.24, 0.04, 10]} />
              <meshStandardMaterial color="#1f242b" flatShading />
            </mesh>
            <mesh position={[0, 0.22, 0]} castShadow>
              <cylinderGeometry args={[0.15, 0.15, 0.4, 10]} />
              <meshStandardMaterial color="#1f242b" flatShading />
            </mesh>
          </group>
        ) : (
          <mesh position={[0, 1.2, 0]} castShadow>
            <coneGeometry args={[0.2, 0.18, 8]} />
            <meshStandardMaterial color={hatColor} flatShading />
          </mesh>
        )}
      </group>
    </group>
  );
}

export function Residents() {
  const { session, view } = useSolo();
  void view.day; // re-place as the season advances

  const { owners, folk } = useMemo(() => {
    const world = session.world;

    // workshop id -> anchor position + outfit colour, by type
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

    // AI owners → signature figures by their shop (miners/mine handled via folk).
    const owners: { key: OwnerKey; pos: Vec2; outfit: string }[] = [];
    for (const o of world.owners.values()) {
      if (!o.strategy) continue; // skip the player
      const shop = shopAnchor.get(o.workshopId);
      if (shop) owners.push({ key: o.strategy as OwnerKey, pos: shop.pos, outfit: tradeColor[shop.type as keyof typeof tradeColor] ?? diorama.plaster });
    }

    // Residents, capped and sorted so the pick is stable across renders.
    const alive = rules.aliveResidents(world).slice(0, MAX_FIGURES);
    const folk = alive.map((r) => {
      const a = anchorFor(r.employerId);
      // Miners/woodcutters at the Co-op get scattered toward the mine sometimes.
      return { id: r.id, pos: a.pos, outfit: a.outfit };
    });

    return { owners, folk };
  }, [session, view.day]);

  return (
    <group>
      {folk.map((f) => (
        <Person key={f.id} anchor={f.pos} seed={f.id} outfit={f.outfit} />
      ))}
      {owners.map((o) => (
        <Person key={`owner-${o.key}`} anchor={o.pos} seed={`owner-${o.key}`} outfit={o.outfit} owner={o.key} />
      ))}
      {/* a couple of miners by the mine */}
      <Person anchor={MINE.pos} seed="miner-1" outfit={tradeColor.mine} spread={0.6} />
      <Person anchor={MINE.pos} seed="miner-2" outfit={tradeColor.mine} spread={0.6} />
    </group>
  );
}
