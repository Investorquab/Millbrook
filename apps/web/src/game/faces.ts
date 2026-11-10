/** Portraits we have original art for (design/assets/face-*.svg). */
const KNOWN_FACES = new Set(["ada", "tom", "mara", "ike", "fern", "gus", "rita", "sam"]);

/** A deterministic accent colour for residents without a dedicated portrait. */
const INITIAL_COLORS = ["#5E8C93", "#6E9B5A", "#B23A48", "#D9A441", "#8B6FB0", "#C06B3E"];

export interface FaceInfo {
  /** Portrait src if we have art for this resident, else null. */
  src: string | null;
  /** First initial, for the fallback avatar. */
  initial: string;
  /** Fallback avatar background. */
  color: string;
}

export function faceFor(name: string): FaceInfo {
  const key = name.trim().toLowerCase();
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  if (KNOWN_FACES.has(key)) {
    return { src: `/art/face-${key}.svg`, initial, color: "#2F3640" };
  }
  // Stable colour from the name so the same resident always looks the same.
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return { src: null, initial, color: INITIAL_COLORS[hash % INITIAL_COLORS.length]! };
}
