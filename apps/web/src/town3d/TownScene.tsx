/**
 * The 3D town — an original low-poly diorama that replaces the `town.svg`
 * stand-in. A miniature mill town at dusk seen from a tilted camera, like a
 * model village on a table: one warm low sun with soft shadows, a cool sky fill,
 * and fog at the rim so the edges melt away. The simulation shows in the world —
 * busy shops smoke, the forge glows, the crowd gathers where people work.
 *
 * No external assets: every mesh is built from three primitives here, so it
 * loads instantly, stays well inside the perf budget, and is fully original.
 * See LICENSES.md.
 */
import { useEffect } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useSolo } from "../game/SoloProvider";
import { diorama } from "./palette";
import { Ground } from "./ground";
import { Residents } from "./Residents";
import {
  Barn,
  Field,
  House,
  Mine,
  TownHall,
  Well,
  Workshop,
} from "./buildings";
import { COOP, HOUSES, MINE, TOWN_HALL, WELL, WORKSHOPS } from "./layout";

const reducedMotion =
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Point the fixed camera at the heart of the square. */
function LookAt({ target }: { target: [number, number, number] }) {
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    camera.lookAt(...target);
  }, [camera, target]);
  return null;
}

function Buildings() {
  const { view, session } = useSolo();
  // Which shops are "busy" (sold today) / bankrupt, read live.
  const state = new Map<string, { busy: boolean; bankrupt: boolean }>();
  for (const w of session.world.workshops.values()) {
    state.set(w.type, { busy: w.soldToday > 0.5, bankrupt: w.bankrupt });
  }
  const playerType = session.world.workshops.get(session.playerWorkshopId)?.type;

  return (
    <group>
      {WORKSHOPS.map((s) => {
        const st = state.get(s.type) ?? { busy: false, bankrupt: false };
        return (
          <Workshop
            key={s.type}
            type={s.type}
            pos={s.pos}
            rot={s.rot}
            busy={st.busy || (s.type === "bakery" && view.soldToday > 0)}
            bankrupt={st.bankrupt}
            isPlayer={s.type === playerType}
          />
        );
      })}
      <TownHall pos={TOWN_HALL.pos} rot={TOWN_HALL.rot} />
      <Barn pos={COOP.barn.pos} rot={COOP.barn.rot} />
      {COOP.fields.map((f, i) => (
        <Field key={i} pos={f.pos} crop={f.crop} />
      ))}
      <Mine pos={MINE.pos} rot={MINE.rot} />
      {HOUSES.map((h, i) => (
        <House key={i} pos={h.pos} rot={h.rot} tone={h.tone} />
      ))}
      <Well pos={WELL} />
    </group>
  );
}

export function TownScene() {
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      frameloop={reducedMotion ? "demand" : "always"}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      camera={{ position: [12.5, 10.8, 13.8], fov: 30, near: 1, far: 60 }}
      onCreated={({ gl, scene }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.05;
        scene.background = new THREE.Color(diorama.fog);
      }}
    >
      <LookAt target={[0, 1.1, 0.3]} />
      <fog attach="fog" args={[diorama.fog, 20, 38]} />

      {/* dusk lighting: one warm low sun + a cool sky fill */}
      <hemisphereLight args={[diorama.sky, diorama.meadowDark, 0.7]} />
      <ambientLight intensity={0.22} />
      <directionalLight
        position={[-9, 7.5, 5]}
        intensity={1.5}
        color={"#ffb27a"}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-12}
        shadow-camera-right={12}
        shadow-camera-top={12}
        shadow-camera-bottom={-12}
        shadow-camera-near={1}
        shadow-camera-far={40}
        shadow-bias={-0.0004}
      />
      {/* a faint warm rim from the opposite side, no shadows */}
      <directionalLight position={[8, 4, -6]} intensity={0.3} color={diorama.skyLow} />

      <Ground />
      <Buildings />
      <Residents />
    </Canvas>
  );
}
