import * as THREE from "three";
import { diorama } from "./palette";

/**
 * One shared warm-lamp material for every lit window in the town. Because the
 * windows all reference this single material, the day/night driver can brighten
 * or dim every lamp at once by writing one `emissiveIntensity` — no per-building
 * prop threading, no per-frame React state.
 */
export const lampMaterial = new THREE.MeshStandardMaterial({
  color: diorama.lamp,
  emissive: new THREE.Color(diorama.lamp),
  emissiveIntensity: 0.7,
  flatShading: true,
});

/** How far into night the town is, 0 (broad day) … 1 (deep night). The driver
 *  writes it each frame; read it if another mesh wants to react to nightfall. */
export const nightRef = { value: 0.5 };
