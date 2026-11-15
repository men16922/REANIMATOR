// Sealed extraction hatch: a segmented iris door with emissive seams, a status label and a glow well behind it.
// Replaces the bare orange torus that used to hang above the Cryo Airlock exit. Display-side only.
import * as THREE from 'three';
import { mulberry32 } from './textures3d';

const SEGMENTS = 8;

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d') as CanvasRenderingContext2D];
}

function tex(c: HTMLCanvasElement, srgb: boolean): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Iris colour map and matching emissive seam map (same layout, so the seams glow where the blades meet). */
function irisTextures(): { map: THREE.CanvasTexture; emissive: THREE.CanvasTexture } {
  const S = 512;
  const [c, g] = canvas(S, S);
  const [e, h] = canvas(S, S);
  const rnd = mulberry32(0x1215);
  const cx = S / 2;
  g.fillStyle = '#0b1218';
  g.fillRect(0, 0, S, S);
  h.fillStyle = '#000';
  h.fillRect(0, 0, S, S);
  const R = S / 2 - 6;
  for (let i = 0; i < SEGMENTS; i++) {
    const a0 = (i / SEGMENTS) * Math.PI * 2 - Math.PI / 2;
    const a1 = ((i + 1) / SEGMENTS) * Math.PI * 2 - Math.PI / 2;
    const mid = (a0 + a1) / 2;
    const grad = g.createLinearGradient(cx, cx, cx + Math.cos(mid) * R, cx + Math.sin(mid) * R);
    const tone = 52 + Math.round(rnd() * 22);
    grad.addColorStop(0, `rgb(${tone + 22},${tone + 30},${tone + 38})`);
    grad.addColorStop(1, `rgb(${tone - 14},${tone - 8},${tone})`);
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(cx, cx);
    g.arc(cx, cx, R, a0 + 0.012, a1 - 0.012);
    g.closePath();
    g.fill();
    // brushed streaks along the blade
    g.strokeStyle = 'rgba(190,210,225,0.07)';
    g.lineWidth = 1;
    for (let k = 0; k < 26; k++) {
      const a = a0 + 0.04 + rnd() * (a1 - a0 - 0.08);
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * R * 0.2, cx + Math.sin(a) * R * 0.2);
      g.lineTo(cx + Math.cos(a) * R * (0.6 + rnd() * 0.4), cx + Math.sin(a) * R * (0.6 + rnd() * 0.4));
      g.stroke();
    }
    // seam (dark in colour map, bright in emissive map)
    for (const [ctx, col, lw] of [[g, '#04070a', 7], [h, '#ffffff', 3]] as const) {
      ctx.strokeStyle = col;
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a0) * R * 0.16, cx + Math.sin(a0) * R * 0.16);
      ctx.lineTo(cx + Math.cos(a0) * R, cx + Math.sin(a0) * R);
      ctx.stroke();
    }
    // blade rivets
    g.fillStyle = 'rgba(15,22,28,0.9)';
    for (const f of [0.45, 0.7, 0.9]) {
      g.beginPath();
      g.arc(cx + Math.cos(mid) * R * f, cx + Math.sin(mid) * R * f, 4, 0, Math.PI * 2);
      g.fill();
    }
  }
  // Grime pooling toward the rim, hub plate and outer lamp ring.
  const rim = g.createRadialGradient(cx, cx, R * 0.6, cx, cx, R);
  rim.addColorStop(0, 'rgba(0,0,0,0)');
  rim.addColorStop(1, 'rgba(0,0,0,0.55)');
  g.fillStyle = rim;
  g.fillRect(0, 0, S, S);
  g.fillStyle = '#10181f';
  g.beginPath();
  g.arc(cx, cx, R * 0.17, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#2a3944';
  g.lineWidth = 5;
  g.stroke();
  h.fillStyle = '#fff';
  h.beginPath();
  h.arc(cx, cx, R * 0.07, 0, Math.PI * 2);
  h.fill();
  h.lineWidth = 3;
  h.strokeStyle = '#ffffff';
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    h.beginPath();
    h.moveTo(cx + Math.cos(a) * R * 0.94, cx + Math.sin(a) * R * 0.94);
    h.lineTo(cx + Math.cos(a) * R * 0.99, cx + Math.sin(a) * R * 0.99);
    h.stroke();
  }
  return { map: tex(c, true), emissive: tex(e, true) };
}

function labelTexture(title: string, status: string, color: string): THREE.CanvasTexture {
  const [c, g] = canvas(512, 128);
  g.fillStyle = 'rgba(6,10,14,0.9)';
  g.fillRect(0, 0, 512, 128);
  g.strokeStyle = color;
  g.lineWidth = 4;
  g.strokeRect(6, 6, 500, 116);
  g.fillStyle = 'rgba(190,205,215,0.9)';
  g.font = 'bold 40px monospace';
  g.textAlign = 'center';
  g.fillText(title, 256, 52);
  g.fillStyle = color;
  g.font = 'bold 46px monospace';
  g.fillText(status, 256, 104);
  return tex(c, true);
}

export interface ExtractionHatch {
  group: THREE.Group;
  /** open: Core destroyed (hatch cycles open). Display-side animation only. */
  update(open: boolean, tSec: number, dt: number): void;
  dispose(): void;
}

export function createExtractionHatch(): ExtractionHatch {
  const group = new THREE.Group();
  group.name = 'extraction-hatch';
  const { map, emissive } = irisTextures();
  const labelSealed = labelTexture('EXTRACTION HATCH', 'SEALED', '#ff9a4a');
  const labelOpen = labelTexture('EXTRACTION HATCH', 'OPEN', '#4dffb0');

  const frame = new THREE.Mesh(
    new THREE.TorusGeometry(1.55, 0.14, 8, 40),
    new THREE.MeshStandardMaterial({ color: 0x2b3640, metalness: 0.8, roughness: 0.45 }),
  );
  frame.position.z = 0.02;
  const glow = new THREE.Mesh(
    new THREE.CircleGeometry(1.45, 32),
    new THREE.MeshBasicMaterial({ color: 0x3dff9e, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  glow.position.z = -0.02;
  const irisMat = new THREE.MeshStandardMaterial({
    map,
    emissiveMap: emissive,
    emissive: new THREE.Color(0xff8a3d),
    emissiveIntensity: 1.1,
    metalness: 0.7,
    roughness: 0.5,
  });
  const iris = new THREE.Mesh(new THREE.CircleGeometry(1.46, 48), irisMat);
  const labelMat = new THREE.MeshBasicMaterial({ map: labelSealed, transparent: true, opacity: 0.95 });
  const label = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.475), labelMat);
  label.position.set(0, -2.0, 0.05);
  group.add(glow, iris, frame, label);

  let openAmt = 0;
  return {
    group,
    update(open, tSec, dt) {
      openAmt += ((open ? 1 : 0) - openAmt) * Math.min(1, dt * 2.5);
      iris.scale.setScalar(1 - openAmt * 0.78);
      iris.rotation.z = openAmt * Math.PI * 0.35;
      (glow.material as THREE.MeshBasicMaterial).opacity = openAmt * (0.55 + 0.15 * Math.sin(tSec * 3));
      irisMat.emissive.setHex(open ? 0x3dff9e : 0xff8a3d);
      irisMat.emissiveIntensity = open ? 1.6 : 0.75 + 0.35 * (0.5 + 0.5 * Math.sin(tSec * 1.6));
      labelMat.map = open ? labelOpen : labelSealed;
    },
    dispose() {
      for (const o of [frame, glow, iris, label]) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
      for (const t of [map, emissive, labelSealed, labelOpen]) t.dispose();
    },
  };
}
