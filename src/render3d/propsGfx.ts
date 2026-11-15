// R4 procedural props: hologram and shield shaders plus item silhouettes (boots, energy tank) and a save-station machine.
// Everything is primitive geometry; no lights are added.

import * as THREE from 'three';

const HOLO_VERT = /* glsl */ `
varying vec3 vN;
varying vec3 vP;
varying vec3 vV;
void main() {
  vP = position;
  vN = normalize(normalMatrix * normal);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}
`;

const HOLO_FRAG = /* glsl */ `
uniform float uT;
uniform vec3 uColor;
uniform float uAlpha;
varying vec3 vN;
varying vec3 vP;
varying vec3 vV;
void main() {
  float fres = pow(1.0 - clamp(abs(dot(normalize(vN), normalize(vV))), 0.0, 1.0), 1.8);
  float scan = 0.65 + 0.35 * sin(vP.y * 38.0 - uT * 5.0);
  float flick = 0.9 + 0.1 * sin(uT * 31.0);
  float a = (0.18 + fres * 0.85) * scan * flick * uAlpha;
  gl_FragColor = vec4(uColor * (0.7 + fres), a);
}
`;

/** Fresnel + scanline hologram (replaces wireframe holograms). Update `uniforms.uT` each frame. */
export function createHoloMaterial(color: number, alpha = 1): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: HOLO_VERT,
    fragmentShader: HOLO_FRAG,
    uniforms: { uT: { value: 0 }, uColor: { value: new THREE.Color(color) }, uAlpha: { value: alpha } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

const SHIELD_FRAG = /* glsl */ `
uniform float uT;
uniform vec3 uColor;
varying vec3 vN;
varying vec3 vP;
varying vec3 vV;
float hexLine(vec2 p) {
  p *= 2.2;
  vec2 q = vec2(p.x * 1.1547, p.y + p.x * 0.5774);
  vec2 f = abs(fract(q) - 0.5);
  return smoothstep(0.44, 0.5, max(f.x, max(f.y, abs(f.x + f.y - 0.0))));
}
void main() {
  float fres = pow(1.0 - clamp(abs(dot(normalize(vN), normalize(vV))), 0.0, 1.0), 2.2);
  vec3 n = normalize(vP);
  float cells = hexLine(vec2(atan(n.x, n.z) * 1.6, n.y * 2.4));
  float pulse = 0.5 + 0.5 * sin(uT * 2.0 + n.y * 6.0);
  float a = fres * 0.7 + cells * (0.25 + 0.2 * pulse) * (0.3 + fres);
  gl_FragColor = vec4(uColor * (0.9 + fres), a * 0.8);
}
`;

/** Energy shield: fresnel rim with a faint hex cell pattern. */
export function createShieldMaterial(color: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: HOLO_VERT,
    fragmentShader: SHIELD_FRAG,
    uniforms: { uT: { value: 0 }, uColor: { value: new THREE.Color(color) } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

function metal(color: number, emissive = 0x000000, ei = 0): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: ei, metalness: 0.75, roughness: 0.4 });
}

/** Thruster boot silhouette: sole, shaft, toe cap, heel nozzle with a glowing exhaust. Height about 0.7. */
export function buildBootsItem(color: number): THREE.Group {
  const g = new THREE.Group();
  const steel = metal(0xaab6c4);
  const dark = metal(0x56626f);
  const glow = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.3, roughness: 0.3 });
  const sole = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.1, 0.26), dark);
  sole.position.set(0.04, -0.28, 0);
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.46, 0.24), steel);
  shaft.position.set(-0.12, -0.02, 0);
  const foot = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.2, 0.24), steel);
  foot.position.set(0.12, -0.17, 0);
  const toe = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.14, 0.26), dark);
  toe.position.set(0.3, -0.19, 0);
  const cuff = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.07, 0.3), dark);
  cuff.position.set(-0.12, 0.24, 0);
  const strip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.3, 0.26), glow);
  strip.position.set(-0.01, 0.0, 0);
  const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 0.2, 10), dark);
  nozzle.position.set(-0.3, -0.2, 0);
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.28, 10), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
  flame.rotation.z = Math.PI;
  flame.position.set(-0.3, -0.45, 0);
  g.add(sole, shaft, foot, toe, cuff, strip, nozzle, flame);
  g.rotation.z = 0.12;
  return g;
}

/** Energy tank: glass cell with glowing liquid, metal end caps and bands. Height about 0.8. */
export function buildEnergyTankItem(color: number): THREE.Group {
  const g = new THREE.Group();
  const cap = metal(0x39434e);
  const liquid = new THREE.Mesh(
    new THREE.CylinderGeometry(0.17, 0.17, 0.5, 14),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.1, roughness: 0.3 }),
  );
  const glass = new THREE.Mesh(
    new THREE.CylinderGeometry(0.23, 0.23, 0.6, 16, 1, true),
    new THREE.MeshStandardMaterial({ color: 0xcfe8f2, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide }),
  );
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.1, 16), cap);
  top.position.y = 0.35;
  const bottom = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.1, 16), cap);
  bottom.position.y = -0.35;
  g.add(liquid, glass, top, bottom);
  for (const y of [-0.12, 0.12]) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.02, 6, 18), metal(0x8a97a4));
    band.rotation.x = Math.PI / 2;
    band.position.y = y;
    g.add(band);
  }
  const plus = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, 0.02), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  plus.position.set(0, 0, 0.24);
  const plus2 = plus.clone();
  plus2.rotation.z = Math.PI / 2;
  g.add(plus, plus2);
  return g;
}

export interface SaveStationProps {
  group: THREE.Group;
  /** Hologram rings to rotate each frame. */
  rings: THREE.Mesh[];
  /** Screen material for the pulse. */
  screen: THREE.MeshStandardMaterial;
}

/** Save/recharge machine: floor plate, console on a plinth with a screen, and two holographic rings above the pad. */
export function buildSaveStation(): SaveStationProps {
  const group = new THREE.Group();
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.55, 0.5), metal(0x2a343f));
  plinth.position.set(1.45, 0.27, -0.1);
  const slab = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.1, 0.6), metal(0x4b5866));
  slab.position.set(1.45, 0.58, -0.1);
  const screen = new THREE.MeshStandardMaterial({ color: 0x0b2a30, emissive: 0x2bf0ff, emissiveIntensity: 0.9, roughness: 0.3 });
  const panel = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.42, 0.06), screen);
  panel.position.set(1.45, 0.92, 0.12);
  panel.rotation.x = -0.3;
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.5, 0.1), metal(0x4b5866));
  post.position.set(1.45, 0.75, -0.2);
  const lampMat = new THREE.MeshStandardMaterial({ color: 0x2bf0ff, emissive: 0x2bf0ff, emissiveIntensity: 1.6 });
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), lampMat);
  lamp.position.set(1.45, 1.22, 0.0);
  group.add(plinth, slab, panel, post, lamp);
  const rings: THREE.Mesh[] = [];
  for (let i = 0; i < 2; i++) {
    const r = new THREE.Mesh(
      new THREE.TorusGeometry(0.62 - i * 0.14, 0.022, 6, 32),
      new THREE.MeshBasicMaterial({ color: 0x2bf0ff, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    r.rotation.x = Math.PI / 2;
    r.position.y = 0.6 + i * 0.55;
    group.add(r);
    rings.push(r);
  }
  return { group, rings, screen };
}
