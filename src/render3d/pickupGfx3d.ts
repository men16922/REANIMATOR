// Holographic pickup base, ground decal and aim reticle textures. Display-side only; shared across all instances.
import * as THREE from 'three';

let pad: THREE.CanvasTexture | null = null;
let glow: THREE.CanvasTexture | null = null;
let reticle: THREE.CanvasTexture | null = null;

function mk(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d') as CanvasRenderingContext2D];
}

function finish(c: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** White projector pad: thin outer ring, dashed inner ring and four tick marks, tinted per pickup via material colour. */
export function getPickupPadTexture(): THREE.CanvasTexture {
  if (pad) return pad;
  const [c, g] = mk(128);
  g.translate(64, 64);
  g.strokeStyle = 'rgba(255,255,255,0.9)';
  g.lineWidth = 2;
  g.beginPath();
  g.arc(0, 0, 60, 0, Math.PI * 2);
  g.stroke();
  g.lineWidth = 3;
  g.setLineDash([6, 5]);
  g.strokeStyle = 'rgba(255,255,255,0.55)';
  g.beginPath();
  g.arc(0, 0, 44, 0, Math.PI * 2);
  g.stroke();
  g.setLineDash([]);
  g.strokeStyle = 'rgba(255,255,255,0.95)';
  g.lineWidth = 4;
  for (let i = 0; i < 4; i++) {
    g.rotate(Math.PI / 2);
    g.beginPath();
    g.moveTo(0, -64);
    g.lineTo(0, -52);
    g.stroke();
  }
  return (pad = finish(c));
}

/** Soft radial glow used for both the ground decal and the sprite halo. */
export function getPickupGlowTexture(): THREE.CanvasTexture {
  if (glow) return glow;
  const [c, g] = mk(64);
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,0.85)');
  r.addColorStop(0.45, 'rgba(255,255,255,0.25)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  return (glow = finish(c));
}

/** Thin crosshair: four arc segments around a gap, short ticks and a small bright centre dot. */
export function getReticleTexture(): THREE.CanvasTexture {
  if (reticle) return reticle;
  const [c, g] = mk(128);
  g.translate(64, 64);
  g.lineCap = 'round';
  g.strokeStyle = 'rgba(255,255,255,0.95)';
  g.lineWidth = 4;
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2 + Math.PI / 4;
    g.beginPath();
    g.arc(0, 0, 44, a - 0.42, a + 0.42);
    g.stroke();
  }
  g.lineWidth = 3;
  for (let i = 0; i < 4; i++) {
    g.rotate(Math.PI / 2);
    g.beginPath();
    g.moveTo(0, -24);
    g.lineTo(0, -14);
    g.stroke();
  }
  g.fillStyle = '#fff';
  g.beginPath();
  g.arc(0, 0, 3, 0, Math.PI * 2);
  g.fill();
  return (reticle = finish(c));
}
