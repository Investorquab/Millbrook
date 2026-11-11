/**
 * A slow, ambient day → night cycle for the diorama. One full day takes ~110s
 * of real time (decoupled from the economy clock, like the strolling), so the
 * town drifts from a bright noon through a golden dusk into a lamp-lit night and
 * back. It owns the three moving lights and, each frame, arcs the sun, retints
 * the fog and sky, and brightens the shared lamp material so every window glows
 * after dark. Under prefers-reduced-motion the scene holds a single golden-dusk
 * frame instead of animating.
 */
import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { AmbientLight, DirectionalLight, HemisphereLight } from "three";
import { diorama } from "./palette";
import { lampMaterial, nightRef } from "./lamps";

const PERIOD = 110; // seconds per full day
const START = 0.72; // open on a warm, lit late-afternoon dusk, then roll into night

const reducedMotion =
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

// Palette stops for the sun, the fog and the sky, lerped by the time of day.
const SUN_NIGHT = new THREE.Color("#5b6b8c");
const SUN_NOON = new THREE.Color("#fff1dc");
const SUN_WARM = new THREE.Color("#ff9a52");
const NIGHT_FOG = new THREE.Color("#141b29");
const DAY_FOG = new THREE.Color("#4c6c88");
const GOLD_FOG = new THREE.Color("#7d5a46");
const NIGHT_BG = new THREE.Color("#0e1520");
const DAY_BG = new THREE.Color("#5b7ea0");
const GOLD_BG = new THREE.Color("#b57a4e");

const tmpSun = new THREE.Color();
const tmpFog = new THREE.Color();
const tmpBg = new THREE.Color();

export function DayNight() {
  const sun = useRef<DirectionalLight>(null);
  const hemi = useRef<HemisphereLight>(null);
  const amb = useRef<AmbientLight>(null);
  const scene = useThree((s) => s.scene);
  const invalidate = useThree((s) => s.invalidate);

  const apply = (tod: number) => {
    const az = (tod - 0.25) * Math.PI * 2;
    const elevation = Math.sin(az); // -1 at midnight … +1 at noon
    const dayAmt = clamp((elevation + 0.05) / 0.4, 0, 1);
    const nightAmt = 1 - clamp((elevation + 0.12) / 0.24, 0, 1);
    const goldenAmt = clamp(1 - Math.abs(elevation) / 0.3, 0, 1); // peaks at the horizon

    if (sun.current) {
      sun.current.position.set(-Math.cos(az) * 9, 1.5 + Math.max(elevation, -0.15) * 9, 5);
      // A strong golden-hour fill keeps the low-sun dusk luminous, not murky.
      sun.current.intensity = 0.1 + dayAmt * 1.5 + goldenAmt * 0.7;
      tmpSun.copy(SUN_NIGHT).lerp(SUN_NOON, dayAmt).lerp(SUN_WARM, goldenAmt * 0.7);
      sun.current.color.copy(tmpSun);
    }
    if (hemi.current) hemi.current.intensity = 0.25 + dayAmt * 0.55 + goldenAmt * 0.5;
    if (amb.current) amb.current.intensity = 0.1 + dayAmt * 0.2 + goldenAmt * 0.22;

    tmpFog.copy(NIGHT_FOG).lerp(DAY_FOG, dayAmt).lerp(GOLD_FOG, goldenAmt * 0.5);
    if (scene.fog instanceof THREE.Fog) scene.fog.color.copy(tmpFog);
    tmpBg.copy(NIGHT_BG).lerp(DAY_BG, dayAmt).lerp(GOLD_BG, goldenAmt * 0.5);
    if (scene.background instanceof THREE.Color) scene.background.copy(tmpBg);
    else scene.background = tmpBg.clone();

    lampMaterial.emissiveIntensity = 0.12 + nightAmt * 1.15;
    nightRef.value = nightAmt;
  };

  // Reduced motion: paint one calm golden-dusk frame and leave it.
  useEffect(() => {
    if (!reducedMotion) return;
    apply(0.72);
    invalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useFrame((state) => {
    if (reducedMotion) return;
    apply((START + state.clock.elapsedTime / PERIOD) % 1);
  });

  return (
    <>
      <hemisphereLight ref={hemi} args={[diorama.sky, diorama.meadowDark, 0.7]} />
      <ambientLight ref={amb} intensity={0.22} />
      <directionalLight
        ref={sun}
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
    </>
  );
}
