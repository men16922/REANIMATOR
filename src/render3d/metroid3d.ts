// Round 5 renderer for the Metroid systems: breakable blocks with crack marks, crawl tunnel markers, map terminals, the final escape
// hatch shutter and the item silhouettes for the Crawl Slide module and the ammo expansion.
// Every visual is a pure function of WorldState3D (openDoors, mapRevealed, meltdown clock). No PointLights, no per-frame allocation:
// meshes are built once per level and only toggled or moved in update().
import * as THREE from 'three';
import { SCAN_TICKS, escapeSealView3D, newScanTargets3D, scanTargets3D, type WorldState3D } from '../game3d/world3d.ts';
import type { Level3D, MapSolid3D } from '../game3d/types3d.ts';

export interface Metroid3D {
  update(w: WorldState3D, tSec: number, dt: number, reduceMotion: boolean): void;
  dispose(): void;
}

/** Procedural cracked slab: dark plate, bright fissures. `accent` is the seam glow (amber = stomp floor, orange = rail plate). */
function crackTexture(accent: string, plate: boolean): THREE.Texture | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d');
  if (!g) return null;
  g.fillStyle = plate ? '#3b4048' : '#2a2f36';
  g.fillRect(0, 0, 128, 128);
  // rivets for plates, rubble speckle for floors
  g.fillStyle = plate ? '#6b727d' : '#1b1f24';
  for (let i = 0; i < 14; i++) g.fillRect((i * 37) % 120 + 3, (i * 53) % 120 + 3, plate ? 4 : 6, plate ? 4 : 3);
  g.strokeStyle = accent;
  g.lineWidth = 2.2;
  g.shadowColor = accent;
  g.shadowBlur = 6;
  const crack = (x: number, y: number, pts: number[]): void => {
    g.beginPath();
    g.moveTo(x, y);
    for (let i = 0; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
    g.stroke();
  };
  crack(64, 0, [58, 22, 70, 40, 52, 62, 66, 84, 60, 128]);
  crack(52, 62, [28, 70, 14, 96, 0, 104]);
  crack(66, 84, [92, 92, 108, 116, 128, 120]);
  crack(70, 40, [96, 36, 112, 22, 128, 24]);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Terminal screen: sector wire map, scanlines and a caption. `done` swaps cyan for teal and 'DOWNLOADED'. */
export function terminalTexture(done: boolean): THREE.Texture | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 96;
  const g = c.getContext('2d');
  if (!g) return null;
  const hi = done ? '#7ff0d0' : '#52e5ff';
  g.fillStyle = done ? '#06241f' : '#04202a';
  g.fillRect(0, 0, 128, 96);
  g.strokeStyle = hi;
  g.globalAlpha = 0.85;
  g.lineWidth = 1.5;
  // room outlines and corridors
  g.strokeRect(10, 16, 30, 20);
  g.strokeRect(52, 16, 26, 20);
  g.strokeRect(90, 16, 28, 20);
  g.strokeRect(24, 46, 34, 22);
  g.strokeRect(74, 46, 36, 22);
  g.beginPath();
  g.moveTo(40, 26); g.lineTo(52, 26);
  g.moveTo(78, 26); g.lineTo(90, 26);
  g.moveTo(65, 36); g.lineTo(65, 46); g.lineTo(58, 46);
  g.moveTo(104, 36); g.lineTo(104, 46); g.lineTo(110, 46);
  g.stroke();
  g.fillStyle = hi;
  g.fillRect(63, 24, 4, 4);
  g.globalAlpha = 1;
  g.font = 'bold 11px monospace';
  g.textAlign = 'center';
  g.fillText(done ? 'DOWNLOADED' : 'MAP DATA', 64, 86);
  g.fillStyle = 'rgba(0,0,0,0.28)';
  for (let y = 0; y < 96; y += 3) g.fillRect(0, y, 128, 1);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Crawl tunnel glow: floor-bright gradient with faded side edges and a row of chevrons, instead of a flat amber slab. */
export function tunnelGlowTexture(): THREE.Texture | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d');
  if (!g) return null;
  const grad = g.createLinearGradient(0, 64, 0, 0);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.55, 'rgba(255,255,255,0.35)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  g.strokeStyle = 'rgba(255,255,255,0.9)';
  g.lineWidth = 3;
  for (let x = 8; x < 64; x += 16) {
    g.beginPath();
    g.moveTo(x, 40); g.lineTo(x + 6, 32); g.lineTo(x, 24);
    g.stroke();
  }
  const side = g.createLinearGradient(0, 0, 64, 0);
  side.addColorStop(0, 'rgba(0,0,0,0.6)');
  side.addColorStop(0.2, 'rgba(0,0,0,0)');
  side.addColorStop(0.8, 'rgba(0,0,0,0)');
  side.addColorStop(1, 'rgba(0,0,0,0.6)');
  g.fillStyle = side;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function stripeStrip(): THREE.Texture | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 16;
  const g = c.getContext('2d');
  if (!g) return null;
  g.fillStyle = '#e9b21c';
  g.fillRect(0, 0, 64, 16);
  g.fillStyle = '#16140f';
  for (let i = -1; i < 5; i++) {
    g.beginPath();
    g.moveTo(i * 16, 16);
    g.lineTo(i * 16 + 8, 16);
    g.lineTo(i * 16 + 16, 0);
    g.lineTo(i * 16 + 8, 0);
    g.closePath();
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Crawl Slide module: a low chevron slab over a glowing rail (reads as "go under"). */
export function buildSlideItem(color: number): THREE.Group {
  const grp = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({ color: 0x1b232c, emissive: color, emissiveIntensity: 0.55, metalness: 0.7, roughness: 0.4 });
  const slab = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.16, 0.34), body);
  grp.add(slab);
  for (let i = 0; i < 3; i++) {
    const chev = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 0.05, 0.36),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95 - i * 0.25, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    chev.position.set(-0.2 + i * 0.2, 0.1, 0);
    chev.rotation.z = -0.5;
    grp.add(chev);
  }
  return grp;
}

/** Ammo expansion: a squat casing with a belt of rounds. */
export function buildAmmoItem(color: number): THREE.Group {
  const grp = new THREE.Group();
  const shell = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.34, 0.3),
    new THREE.MeshStandardMaterial({ color: 0x28313a, emissive: color, emissiveIntensity: 0.4, metalness: 0.75, roughness: 0.45 }),
  );
  grp.add(shell);
  for (let i = 0; i < 4; i++) {
    const round = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.3, 8), new THREE.MeshBasicMaterial({ color }));
    round.position.set(-0.18 + i * 0.12, 0.0, 0.17);
    round.rotation.x = Math.PI / 2;
    grp.add(round);
  }
  return grp;
}

export function buildMetroid3D(scene: THREE.Scene, level: Level3D): Metroid3D {
  const root = new THREE.Group();
  root.name = 'metroid3d';
  scene.add(root);
  const geos: THREE.BufferGeometry[] = [];
  const mats: THREE.Material[] = [];
  const texs: THREE.Texture[] = [];
  const box = new THREE.BoxGeometry(1, 1, 1);
  geos.push(box);
  const track = <T extends THREE.Material>(m: T): T => {
    mats.push(m);
    return m;
  };
  const stripes = stripeStrip();
  if (stripes) texs.push(stripes);
  const tunnelGlow = tunnelGlowTexture();
  if (tunnelGlow) texs.push(tunnelGlow);

  // Breakable blocks: cracked slab/plate. A broken block fades out over 0.35 s.
  interface BlockView { s: MapSolid3D; mesh: THREE.Mesh; mat: THREE.MeshStandardMaterial; fade: number }
  const blocks: BlockView[] = level.solids
    .filter((s) => s.breakId)
    .map((s) => {
      const plate = s.breakBy === 'rail';
      const fake = s.breakBy === 'lean';
      // A fake wall must pass as plain wall: no crack texture, only a faint teal seam shimmer for the attentive.
      const tx = fake ? null : crackTexture(plate ? '#ff8a2a' : '#ffc03a', plate);
      if (tx) {
        tx.wrapS = THREE.RepeatWrapping;
        tx.wrapT = THREE.RepeatWrapping;
        tx.repeat.set(Math.max(1, (s.maxX - s.minX) / 1.6), Math.max(1, (s.maxY - s.minY) / 1.6));
        texs.push(tx);
      }
      const mat = track(
        new THREE.MeshStandardMaterial({
          ...(tx ? { map: tx, emissiveMap: tx } : {}),
          color: fake ? (s.color ?? 0x2f3a48) : 0xffffff,
          emissive: s.emissive ?? 0xff7a2a,
          emissiveIntensity: fake ? 0.12 : 0.55,
          roughness: 0.6,
          metalness: plate ? 0.7 : 0.35,
          transparent: true,
          opacity: 1,
        }),
      );
      const mesh = new THREE.Mesh(box, mat);
      mesh.scale.set(s.maxX - s.minX, s.maxY - s.minY, s.maxZ - s.minZ);
      mesh.position.set((s.minX + s.maxX) / 2, (s.minY + s.maxY) / 2, (s.minZ + s.maxZ) / 2);
      mesh.name = `block:${s.id}`;
      mesh.receiveShadow = true;
      root.add(mesh);
      return { s, mesh, mat, fade: 1 };
    });

  // Scan Pulse markers: pooled, hidden unless the sim's scan flag is set. Existing material types only, no lights.
  const SCAN_POOL = 10;
  const scanOut = newScanTargets3D();
  const frameMat = track(new THREE.LineBasicMaterial({ color: 0x52e5ff, transparent: true, opacity: 0.9, depthTest: false }));
  const secretMat = track(new THREE.LineBasicMaterial({ color: 0xffc03a, transparent: true, opacity: 0.9, depthTest: false }));
  const ringGeo = new THREE.RingGeometry(0.42, 0.52, 24);
  geos.push(ringGeo);
  const ringMat = track(new THREE.MeshBasicMaterial({ color: 0x8fe9ff, transparent: true, opacity: 0.9, depthTest: false, side: THREE.DoubleSide }));
  const edgeGeo = new THREE.EdgesGeometry(box);
  geos.push(edgeGeo);
  const frames: THREE.LineSegments[] = [];
  const rings: THREE.Mesh[] = [];
  for (let i = 0; i < SCAN_POOL; i++) {
    const f = new THREE.LineSegments(edgeGeo, frameMat);
    f.visible = false;
    f.renderOrder = 20;
    root.add(f);
    frames.push(f);
    const r = new THREE.Mesh(ringGeo, ringMat);
    r.visible = false;
    r.renderOrder = 20;
    r.position.z = 1.2;
    root.add(r);
    rings.push(r);
  }

  // Tunnel mouths: striped frame on the lintel face plus an amber chevron glow inside the opening
  const glows: THREE.MeshBasicMaterial[] = [];
  for (const tn of level.tunnels) {
    const lintelTop = tn.floorY + tn.clearance;
    const mouth = level.solids.find((s) => s.maxX >= tn.mouthX && s.minX <= tn.mouthX && Math.abs(s.minY - lintelTop) < 0.05);
    const w = mouth ? mouth.maxX - mouth.minX : 0.8;
    const cx = mouth ? (mouth.minX + mouth.maxX) / 2 : tn.mouthX;
    const frontZ = mouth ? mouth.maxZ + 0.02 : 3.22;
    if (stripes) {
      const sm = track(new THREE.MeshBasicMaterial({ map: stripes, transparent: true, opacity: 0.95 }));
      const strip = new THREE.Mesh(box, sm);
      strip.scale.set(Math.max(w, 0.8) + 0.5, 0.22, 0.02);
      strip.position.set(cx, lintelTop + 0.15, frontZ);
      root.add(strip);
      const strip2 = new THREE.Mesh(box, sm);
      strip2.scale.set(Math.max(w, 0.8) + 0.5, 0.14, 0.02);
      strip2.position.set(cx, tn.floorY + 0.07, frontZ);
      root.add(strip2);
    }
    const gm = track(new THREE.MeshBasicMaterial({ map: tunnelGlow ?? undefined, color: 0xffb02e, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
    glows.push(gm);
    const glow = new THREE.Mesh(box, gm);
    glow.scale.set(Math.max(w, 0.8), tn.clearance - 0.1, 0.05);
    glow.position.set(cx, tn.floorY + tn.clearance / 2, frontZ - 0.03);
    root.add(glow);
  }

  // Map terminals: a console with a screen that turns from cyan to teal once used
  interface TermView { sector: string; screen: THREE.MeshBasicMaterial }
  const termIdle = terminalTexture(false);
  const termDone = terminalTexture(true);
  if (termIdle) texs.push(termIdle);
  if (termDone) texs.push(termDone);
  const terms: TermView[] = level.mapStations.map((ms) => {
    const body = new THREE.Mesh(box, track(new THREE.MeshStandardMaterial({ color: 0x1b2630, metalness: 0.7, roughness: 0.45 })));
    body.scale.set(0.9, 1.1, 0.5);
    body.position.set(ms.x, ms.y + 0.55, -0.9);
    root.add(body);
    const bezel = new THREE.Mesh(box, track(new THREE.MeshStandardMaterial({ color: 0x0d1318, metalness: 0.8, roughness: 0.35 })));
    bezel.scale.set(0.8, 0.62, 0.04);
    bezel.position.set(ms.x, ms.y + 0.78, -0.65);
    root.add(bezel);
    const screen = track(new THREE.MeshBasicMaterial(termIdle ? { map: termIdle } : { color: 0x52e5ff }));
    const scr = new THREE.Mesh(box, screen);
    scr.scale.set(0.7, 0.52, 0.02);
    scr.position.set(ms.x, ms.y + 0.78, -0.62);
    root.add(scr);
    const base = new THREE.Mesh(box, track(new THREE.MeshStandardMaterial({ color: 0x28333f, metalness: 0.6, roughness: 0.5 })));
    base.scale.set(1.1, 0.12, 0.7);
    base.position.set(ms.x, ms.y + 0.06, -0.9);
    root.add(base);
    return { sector: ms.sector, screen };
  });

  // Final hatch shutter: lowers from the ceiling during the warning, solid once shut
  const shutter = level.solids.find((s) => s.sealId);
  let shutterMesh: THREE.Mesh | null = null;
  let shutterMat: THREE.MeshStandardMaterial | null = null;
  if (shutter) {
    shutterMat = track(
      new THREE.MeshStandardMaterial({ map: stripes ?? undefined, color: 0xb7a888, emissive: 0xff2a2a, emissiveIntensity: 0.6, roughness: 0.4, metalness: 0.7 }),
    );
    shutterMesh = new THREE.Mesh(box, shutterMat);
    shutterMesh.visible = false;
    root.add(shutterMesh);
  }

  return {
    update(w, tSec, dt, reduceMotion): void {
      for (const b of blocks) {
        const broken = w.openDoors.has(b.s.breakId!);
        b.fade += ((broken ? 0 : 1) - b.fade) * Math.min(1, dt * 9);
        b.mesh.visible = b.fade > 0.03;
        b.mat.opacity = b.fade;
        // Seams breathe so the marked block reads as breakable without a light
        b.mat.emissiveIntensity = broken ? 1.6 : b.s.breakBy === 'lean' ? (reduceMotion ? 0.12 : 0.1 + 0.07 * Math.sin(tSec * 1.3)) : reduceMotion ? 0.55 : 0.45 + 0.2 * Math.sin(tSec * 2.4 + b.s.minX);
        if (broken) b.mesh.position.y -= dt * 2.5 * (1 - b.fade);
        else b.mesh.position.y = (b.s.minY + b.s.maxY) / 2;
      }
      const scanning = w.player.scanTicks > 0;
      let fi = 0;
      let ri = 0;
      if (scanning) {
        const k = w.player.scanTicks / SCAN_TICKS;
        const fade = Math.min(1, k * 4);
        const pulse = reduceMotion ? 1 : 1 + 0.06 * Math.sin(tSec * 8);
        frameMat.opacity = 0.9 * fade;
        secretMat.opacity = 0.9 * fade;
        ringMat.opacity = 0.9 * fade;
        const t = scanTargets3D(w, undefined, scanOut);
        // Secrets first so a crowd of breakable blocks can never push them out of the pool; each list is nearest first
        for (let pass = 0; pass < 2; pass++) {
          const list = pass === 0 ? t.secrets : t.blocks;
          const mat = pass === 0 ? secretMat : frameMat;
          for (const s of list) {
            if (fi >= SCAN_POOL) break;
            const f = frames[fi++];
            f.material = mat;
            f.visible = true;
            f.scale.set((s.maxX - s.minX + 0.12) * pulse, (s.maxY - s.minY + 0.12) * pulse, s.maxZ - s.minZ + 0.12);
            f.position.set((s.minX + s.maxX) / 2, (s.minY + s.maxY) / 2, (s.minZ + s.maxZ) / 2);
          }
        }
        for (const k2 of t.pickups) {
          if (ri >= SCAN_POOL) break;
          const r = rings[ri++];
          r.visible = true;
          r.position.set(k2.x, k2.y + 0.5, 1.2);
          r.scale.setScalar(pulse * 1.4);
        }
      }
      for (; fi < SCAN_POOL; fi++) frames[fi].visible = false;
      for (; ri < SCAN_POOL; ri++) rings[ri].visible = false;
      const slideOn = w.player.abilities.crawlSlide;
      for (const gm of glows) gm.opacity = slideOn ? (reduceMotion ? 0.4 : 0.3 + 0.15 * Math.sin(tSec * 3)) : 0.14;
      for (const t of terms) {
        const used = w.mapRevealed.includes(t.sector as never);
        if (termIdle && termDone) {
          const want = used ? termDone : termIdle;
          if (t.screen.map !== want) { t.screen.map = want; t.screen.needsUpdate = true; }
        } else t.screen.color.setHex(used ? 0x78c8be : 0x52e5ff);
      }
      if (shutter && shutterMesh && shutterMat) {
        const v = escapeSealView3D(w);
        shutterMesh.visible = v.warning;
        if (v.warning) {
          const h = (shutter.maxY - shutter.minY) * Math.max(0.04, v.progress);
          shutterMesh.scale.set(shutter.maxX - shutter.minX, h, shutter.maxZ - shutter.minZ);
          shutterMesh.position.set((shutter.minX + shutter.maxX) / 2, shutter.maxY - h / 2, 0);
          shutterMat.emissiveIntensity = v.closed ? 0.3 : reduceMotion ? 0.8 : 0.4 + 0.9 * (0.5 + 0.5 * Math.sin(tSec * 14));
        }
      }
    },
    dispose(): void {
      scene.remove(root);
      for (const g of geos) g.dispose();
      for (const m of mats) m.dispose();
      for (const t of texs) t.dispose();
    },
  };
}
