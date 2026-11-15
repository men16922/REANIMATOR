// R14: character lighting rig (render only, pure constants, node-testable).
// A camera-relative key + fill term is injected into character materials only (terrain is never touched), so the
// form and albedo read at gameplay distance. No lights are added. The fresnel rim is only a subtle accent.

export type CharKind3D = 'operative' | 'heroGear' | 'stalker' | 'crawler' | 'spitter' | 'warden' | 'hunter';

/** Subtle fresnel accent range required by R14. */
export const CHAR_RIM_MIN = 0.25;
export const CHAR_RIM_MAX = 0.35;

export interface CharLightTuning {
  /** Fresnel rim strength (accent). */
  rim: number;
  /** Albedo self-lift (flat, lighting independent). */
  lift: number;
  /** Key light (upper-left-front, camera relative) strength on albedo. */
  key: number;
  /** Fill light (lower-right-front) strength on albedo. */
  fill: number;
  /** Character-only exposure multiplier (1.0 = unchanged; 2.0 = one stop). */
  exposure: number;
}

/** Characters sit about one stop above the background; dark gunmetal kinds get a little more key, not more lift. */
export const CHAR_LIGHT: Readonly<Record<CharKind3D, CharLightTuning>> = {
  operative: { rim: 0.3, lift: 0.04, key: 0.55, fill: 0.2, exposure: 1.3 },
  heroGear: { rim: 0.25, lift: 0.02, key: 0.45, fill: 0.15, exposure: 1.3 },
  stalker: { rim: 0.32, lift: 0.1, key: 0.7, fill: 0.28, exposure: 1.45 },
  crawler: { rim: 0.3, lift: 0.1, key: 0.7, fill: 0.28, exposure: 1.45 },
  spitter: { rim: 0.3, lift: 0.1, key: 0.7, fill: 0.28, exposure: 1.45 },
  warden: { rim: 0.35, lift: 0, key: 0.6, fill: 0.22, exposure: 1.35 },
  hunter: { rim: 0.25, lift: 0, key: 0.5, fill: 0.2, exposure: 1.25 },
};

/** Front-face material exposure: env reflections stay moderate so dark metal does not wash out. */
export const CHAR_ENV_INTENSITY = 0.85;
/** Crevice darkening floor (1 = off). Downward-facing normals fall to this value. */
export const CHAR_AO_FLOOR = 0.78;

/** View-space light directions (camera relative: the camera looks down -z, +y up). Not normalised here. */
export const CHAR_KEY_DIR: readonly [number, number, number] = [-0.45, 0.65, 0.62];
export const CHAR_FILL_DIR: readonly [number, number, number] = [0.6, -0.25, 0.5];

/** GLSL snippet shared by every character shader. Needs uniform vec3 uCharLight (key, fill, exposure) and `normal`. */
export const CHAR_LIGHT_GLSL = `
  vec3 chKey = normalize(vec3(${CHAR_KEY_DIR.map((v) => v.toFixed(3)).join(',')}));
  vec3 chFill = normalize(vec3(${CHAR_FILL_DIR.map((v) => v.toFixed(3)).join(',')}));
  vec3 chN = normalize(normal);
  float chAo = mix(${CHAR_AO_FLOOR.toFixed(3)}, 1.0, smoothstep(-0.9, 0.35, chN.y));
  float chDiff = max(dot(chN, chKey), 0.0) * uCharLight.x + max(dot(chN, chFill), 0.0) * uCharLight.y;
  outgoingLight = (outgoingLight + diffuseColor.rgb * chDiff) * chAo * uCharLight.z;
`;
