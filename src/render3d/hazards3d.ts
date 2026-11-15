// Round 4 renderer for environmental hazards and set pieces: steam vents, crusher pistons, laser grids, meltdown rubble,
// the Bio-Labs switch and gantry, the cargo lift and the collapsing airlock bridge.
// Every visual is a pure function of WorldState3D (tick, hazard cycle, elevator/switch/collapse state). No PointLights, no per-frame
// allocation: meshes are built once per level, smoke goes through the shared FxDirector smoke pool.
import * as THREE from 'three';
import type { ParticlePool } from './fx3d.ts';
import { crusherBottomY, hazardPhase, hazardPhaseT } from '../game3d/hazards.ts';
import { hazardNowTick3D, type WorldState3D } from '../game3d/world3d.ts';
import { mergeStaticChildren } from './meshMerge.ts';
import type { HazardSpawn3D, Level3D, MapSolid3D } from '../game3d/types3d.ts';

export interface Hazards3D {
  update(w: WorldState3D, tSec: number, dt: number, smoke: ParticlePool, reduceMotion: boolean): void;
  /** Classic View quantizes to a 16 color palette: steam and glow get weaker so they do not turn into white slabs. */
  setClassic(on: boolean): void;
  dispose(): void;
}

const MAT_METAL = (): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ color: 0x59606a, roughness: 0.45, metalness: 0.8 });

function stripeTexture(): THREE.Texture | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d');
  if (!g) return null;
  g.fillStyle = '#e9b21c';
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#16140f';
  for (let i = -2; i < 4; i++) {
    g.beginPath();
    g.moveTo(i * 32, 64);
    g.lineTo(i * 32 + 16, 64);
    g.lineTo(i * 32 + 64 + 16, 0);
    g.lineTo(i * 32 + 64, 0);
    g.closePath();
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function beamTexture(): THREE.Texture | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = 8;
  c.height = 64;
  const g = c.getContext('2d');
  if (!g) return null;
  g.clearRect(0, 0, 8, 64);
  for (let i = 0; i < 6; i++) {
    const y = 6 + i * 10;
    const grd = g.createLinearGradient(0, y - 3, 0, y + 3);
    grd.addColorStop(0, 'rgba(255,40,40,0)');
    grd.addColorStop(0.5, 'rgba(255,120,110,1)');
    grd.addColorStop(1, 'rgba(255,40,40,0)');
    g.fillStyle = grd;
    g.fillRect(0, y - 3, 8, 6);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Soft steam column: scrolling value noise, horizontal edge fade that widens with height, fade in at the base and out at the top. */
export const STEAM_VERT = `varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
export const STEAM_FRAG = `precision highp float;
varying vec2 vUv;
uniform float uTime;
uniform float uIntensity;
uniform vec3 uTint;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
void main() {
  float h = vUv.y;
  float hw = mix(0.22, 0.5, h);
  float x = abs(vUv.x - 0.5) / hw;
  float edge = 1.0 - smoothstep(0.35, 1.0, x);
  float rise = smoothstep(0.0, 0.12, h) * (1.0 - smoothstep(0.55, 1.0, h));
  vec2 q = vec2(vUv.x * 3.0, h * 4.0 - uTime * 1.6);
  float n = 0.6 * vnoise(q) + 0.3 * vnoise(q * 2.1 + 7.3) + 0.1 * vnoise(q * 4.3 - 3.1);
  float a = edge * rise * smoothstep(0.25, 0.85, n) * uIntensity;
  gl_FragColor = vec4(uTint * (0.8 + 0.2 * n), a);
}`;

interface VentView { h: HazardSpawn3D; plume: THREE.Mesh; mat: THREE.ShaderMaterial; acc: number }
interface CrusherView { h: HazardSpawn3D; piston: THREE.Mesh; stripes: THREE.MeshStandardMaterial }
interface LaserView { h: HazardSpawn3D; beam: THREE.Mesh; posts: THREE.Mesh[] }
interface RubbleView { h: HazardSpawn3D; shadow: THREE.Mesh; rock: THREE.Mesh; landed: boolean }
interface SegView { solid: MapSolid3D; mesh: THREE.Mesh; fall: number; vy: number; rot: number }

export function buildHazards3D(scene: THREE.Scene, level: Level3D): Hazards3D {
  const root = new THREE.Group();
  root.name = 'hazards3d';
  scene.add(root);
  const geos: THREE.BufferGeometry[] = [];
  const mats: THREE.Material[] = [];
  const texs: THREE.Texture[] = [];
  const box = new THREE.BoxGeometry(1, 1, 1);
  geos.push(box);
  const track = <M extends THREE.Material>(m: M): M => { mats.push(m); return m; };

  const stripes = stripeTexture();
  if (stripes) texs.push(stripes);
  const beamTex = beamTexture();
  if (beamTex) texs.push(beamTex);

  // Static pieces are parented to one group per room and merged by shared material at the end of the build.
  const ventBaseMat = track(new THREE.MeshStandardMaterial({ color: 0x2b2f35, emissive: 0xff7a1a, emissiveIntensity: 0.25, roughness: 0.5, metalness: 0.7 }));
  const plateMat = track(new THREE.MeshStandardMaterial({ map: stripes ?? undefined, color: 0xffffff, roughness: 0.6, metalness: 0.4 }));
  const metalMat = track(MAT_METAL());
  const postMat = track(new THREE.MeshStandardMaterial({ color: 0x2c313a, roughness: 0.5, metalness: 0.8 }));
  const roomGroups = new Map<string, THREE.Group>();
  const staticFor = (x: number, y: number): THREE.Group => {
    let key = 'shaft';
    for (const r of level.rooms) {
      if (x >= r.minX && x <= r.maxX && y >= r.minY - 0.5 && y <= r.maxY + 0.5) {
        key = r.id;
        break;
      }
    }
    let g = roomGroups.get(key);
    if (!g) {
      g = new THREE.Group();
      g.name = `hazard-static:${key}`;
      root.add(g);
      roomGroups.set(key, g);
    }
    return g;
  };
  const rockMat = track(new THREE.MeshStandardMaterial({ color: 0x4a4038, roughness: 0.95, metalness: 0.1, flatShading: true }));
  const vents: VentView[] = [];
  const crushers: CrusherView[] = [];
  const lasers: LaserView[] = [];
  const rubbles: RubbleView[] = [];
  const plumeGeo = new THREE.PlaneGeometry(1, 1);
  const discGeo = new THREE.CircleGeometry(1, 20);
  const rockGeo = new THREE.IcosahedronGeometry(0.8, 0);
  geos.push(plumeGeo, discGeo, rockGeo);

  for (const h of level.hazards) {
    if (h.kind === 'vent') {
      const base = new THREE.Mesh(box, ventBaseMat);
      base.scale.set(h.width + 0.5, 0.16, 1.6);
      base.position.set(h.x, h.y + 0.08, 0);
      staticFor(h.x, h.y).add(base);
      const mat = track(new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uIntensity: { value: 0 }, uTint: { value: new THREE.Color(0.78, 0.86, 0.95) } },
        vertexShader: STEAM_VERT,
        fragmentShader: STEAM_FRAG,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      }));
      // Flat sheet facing the side camera, just behind the character lane (z in [-0.6, 0.6]) so the depth test lets the operative cover it.
      const plume = new THREE.Mesh(plumeGeo, mat);
      plume.scale.set(h.width * 2.2, h.height, 1);
      plume.position.set(h.x, h.y + h.height / 2, -0.7);
      plume.visible = false;
      root.add(plume);
      vents.push({ h, plume, mat, acc: 0 });
    } else if (h.kind === 'crusher') {
      const plate = new THREE.Mesh(box, plateMat);
      plate.scale.set(h.width + 0.6, 0.1, 1.8);
      plate.position.set(h.x, h.y + 0.05, 0);
      staticFor(h.x, h.y).add(plate);
      const sm = track(new THREE.MeshStandardMaterial({ map: stripes ?? undefined, color: 0xd8d2c0, roughness: 0.5, metalness: 0.75, emissive: 0xff2a10, emissiveIntensity: 0 }));
      if (sm.map) { sm.map = sm.map.clone(); sm.map.repeat.set(2, 3); sm.map.needsUpdate = true; texs.push(sm.map); }
      const piston = new THREE.Mesh(box, sm);
      piston.castShadow = true;
      root.add(piston);
      // Guide housing on the ceiling
      const housing = new THREE.Mesh(box, metalMat);
      housing.scale.set(h.width + 0.7, 0.5, 2.0);
      housing.position.set(h.x, h.y + h.height - 0.05, 0);
      staticFor(h.x, h.y).add(housing);
      crushers.push({ h, piston, stripes: sm });
    } else if (h.kind === 'laser') {
      const beam = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), track(new THREE.MeshBasicMaterial({ map: beamTex ?? undefined, color: 0xff5548, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, opacity: 0 })));
      geos.push(beam.geometry);
      beam.scale.set(0.9, h.height, 1);
      beam.position.set(h.x, h.y + h.height / 2, 0);
      beam.visible = false;
      root.add(beam);
      const postsRoot = new THREE.Group();
      const laserPostMat = track(new THREE.MeshStandardMaterial({ color: 0x2c313a, emissive: 0xff2a2a, emissiveIntensity: 0.2, roughness: 0.4, metalness: 0.8 }));
      for (const z of [-1.5, 1.5]) {
        const p = new THREE.Mesh(box, laserPostMat);
        p.scale.set(0.3, h.height + 0.3, 0.3);
        p.position.set(h.x, h.y + h.height / 2, z);
        postsRoot.add(p);
      }
      const merged = mergeStaticChildren(postsRoot).merged;
      for (const m of merged) { geos.push(m.geometry); root.add(m); }
      const posts: THREE.Mesh[] = merged;
      // Emitter bar across z so the grid reads from the side camera
      lasers.push({ h, beam, posts });
    } else {
      const shadow = new THREE.Mesh(discGeo, track(new THREE.MeshBasicMaterial({ color: 0x120a08, transparent: true, opacity: 0, depthWrite: false })));
      shadow.rotation.x = -Math.PI / 2;
      shadow.position.set(h.x, h.y + 0.04, 0);
      shadow.visible = false;
      root.add(shadow);
      const rock = new THREE.Mesh(rockGeo, rockMat);
      rock.scale.set(h.width * 0.6, h.width * 0.6, h.width * 0.6);
      rock.visible = false;
      root.add(rock);
      rubbles.push({ h, shadow, rock, landed: false });
    }
  }

  // Switch posts
  const switchViews = level.switches.map((sp) => {
    const post = new THREE.Mesh(box, postMat);
    post.scale.set(0.35, sp.y + 0.5, 0.35);
    post.position.set(sp.x, (sp.y + 0.5) / 2 - 0.05, 0);
    staticFor(sp.x, sp.y).add(post);
    const head = new THREE.Mesh(box, track(new THREE.MeshStandardMaterial({ color: 0x300808, emissive: 0xff3322, emissiveIntensity: 1.2 })));
    head.scale.set(0.7, 0.7, 0.7);
    head.position.set(sp.x, sp.y, 0);
    root.add(head);
    return { sp, head };
  });

  // Lift car, rails and bio gantry
  const carSolid = (id: string): MapSolid3D | undefined => level.solids.find((s) => s.id === id);
  const liftViews = level.elevators.map((e) => {
    const s = carSolid(e.carId)!;
    const car = new THREE.Mesh(box, track(new THREE.MeshStandardMaterial({ map: stripes ?? undefined, color: 0xb7a888, emissive: 0xffb02a, emissiveIntensity: 0.35, roughness: 0.5, metalness: 0.7 })));
    car.scale.set(s.maxX - s.minX, 0.28, 2.6);
    root.add(car);
    for (const x of [s.minX - 0.1, s.maxX + 0.1]) {
      const rail = new THREE.Mesh(box, metalMat);
      rail.scale.set(0.12, e.topY - e.bottomY, 0.2);
      rail.position.set(x, (e.topY + e.bottomY) / 2, -1.3);
      staticFor(x, (e.topY + e.bottomY) / 2).add(rail);
    }
    return { e, s, car };
  });
  const bridgeViews = level.solids.filter((s) => s.bridgeId).map((s) => {
    const m = new THREE.Mesh(box, track(new THREE.MeshStandardMaterial({ color: s.color ?? 0x59611f, emissive: s.emissive ?? 0, emissiveIntensity: 0.4, roughness: 0.55, metalness: 0.6 })));
    m.scale.set(0.01, s.maxY - s.minY, 3.0);
    m.visible = false;
    root.add(m);
    return { s, m, k: 0 };
  });

  // Collapse segments
  const segViews: SegView[] = level.solids.filter((s) => s.collapseId).map((s) => {
    const mesh = new THREE.Mesh(box, track(new THREE.MeshStandardMaterial({ color: s.color ?? 0x2a3542, roughness: 0.6, metalness: 0.7, emissive: 0xff4a1a, emissiveIntensity: 0 })));
    mesh.scale.set(s.maxX - s.minX, s.maxY - s.minY, s.maxZ - s.minZ);
    mesh.position.set((s.minX + s.maxX) / 2, (s.minY + s.maxY) / 2, 0);
    root.add(mesh);
    return { solid: s, mesh, fall: 0, vy: 0, rot: 0 };
  });

  for (const g of roomGroups.values()) for (const m of mergeStaticChildren(g).merged) geos.push(m.geometry);
  let classicK = 1;

  const smokePuff = (smoke: ParticlePool, x: number, y: number, n: number, up: number, spread: number, r: number, g: number, b: number, a: number): void => {
    for (let i = 0; i < n; i++) {
      // Deterministic jitter (display only), no Math.random
      const j = Math.sin((x + i) * 12.9898 + y * 78.233 + smoke.emitted * 0.37) * 43758.5453;
      const f = j - Math.floor(j);
      smoke.emit(x + (f - 0.5) * spread, y, 0.3, (f - 0.5) * spread * 1.4, up * (0.7 + f * 0.6), 0, 0.8 + f * 0.6, 0.25, 0.9 + f * 0.5, r, g, b, a, -0.2, 1.2, 1, f * 6, (f - 0.5) * 2);
    }
  };

  return {
    setClassic(on): void {
      classicK = on ? 0.45 : 1;
    },
    update(w, tSec, dt, smoke, reduceMotion): void {
      for (const v of vents) {
        const t = hazardNowTick3D(w, v.h);
        const ph = hazardPhase(v.h, t);
        const pt = hazardPhaseT(v.h, t);
        v.plume.visible = ph === 'active' || (ph === 'recover' && pt < 1);
        // Faint and soft: the sheet only tints the air, the smoke particles carry the motion.
        const peak = 0.2 * classicK;
        v.mat.uniforms.uIntensity.value = ph === 'active' ? peak : ph === 'recover' ? peak * (1 - pt) : 0;
        v.mat.uniforms.uTime.value = reduceMotion ? 0 : tSec;
        if (ph === 'telegraph') {
          // Warning: growing hiss of small puffs
          v.acc += dt * (8 + 20 * pt);
        } else if (ph === 'active') {
          v.acc += dt * 34 * classicK;
        } else v.acc = 0;
        while (v.acc >= 1) {
          v.acc -= 1;
          smokePuff(smoke, v.h.x, v.h.y + 0.15, 1, ph === 'active' ? 7 : 1.8, v.h.width * (ph === 'active' ? 0.9 : 0.5), 0.85, 0.9, 0.95, (ph === 'active' ? 0.3 : 0.2) * classicK);
        }
      }
      for (const c of crushers) {
        const t = hazardNowTick3D(w, c.h);
        const ph = hazardPhase(c.h, t);
        const bottom = crusherBottomY(c.h, t);
        const top = c.h.y + c.h.height + 0.2;
        const shake = ph === 'telegraph' && !reduceMotion ? Math.sin(tSec * 90) * 0.04 : 0;
        c.piston.scale.set(c.h.width, top - bottom, 1.7);
        c.piston.position.set(c.h.x + shake, (top + bottom) / 2, 0);
        c.stripes.emissiveIntensity = ph === 'telegraph' ? 0.4 + 0.4 * Math.sin(tSec * 22) : ph === 'active' ? 0.9 : 0;
        if (ph === 'active' && hazardPhaseT(c.h, t) * c.h.active < 2) smokePuff(smoke, c.h.x, c.h.y + 0.1, 3, 1.2, c.h.width * 1.8, 0.6, 0.58, 0.55, 0.45);
      }
      for (const l of lasers) {
        const t = hazardNowTick3D(w, l.h);
        const ph = t < 0 ? 'idle' : hazardPhase(l.h, t);
        const flick = ph === 'telegraph' ? (Math.floor(tSec * 18) % 2 === 0 ? 0.55 : 0) : ph === 'active' ? 1 : 0;
        l.beam.visible = flick > 0;
        (l.beam.material as THREE.MeshBasicMaterial).opacity = flick;
        for (const p of l.posts) (p.material as THREE.MeshStandardMaterial).emissiveIntensity = t < 0 ? 0 : ph === 'idle' ? 0.2 : ph === 'telegraph' ? 1.2 : 2.2;
      }
      for (const r of rubbles) {
        const t = hazardNowTick3D(w, r.h);
        const ph = t < 0 ? 'idle' : hazardPhase(r.h, t);
        const pt = t < 0 ? 0 : hazardPhaseT(r.h, t);
        const sm = r.shadow.material as THREE.MeshBasicMaterial;
        r.shadow.visible = ph === 'telegraph';
        sm.opacity = 0.2 + 0.5 * pt;
        r.shadow.scale.setScalar(r.h.width * (0.35 + 0.65 * pt));
        const dropping = ph === 'telegraph' && pt > 0.8;
        r.rock.visible = dropping || ph === 'active';
        if (dropping) {
          const f = (pt - 0.8) / 0.2;
          r.rock.position.set(r.h.x, r.h.y + 0.5 + (r.h.height - 0.5) * (1 - f * f), 0);
          r.rock.rotation.z = tSec * 6;
          r.landed = false;
        } else if (ph === 'active') {
          r.rock.position.set(r.h.x, r.h.y + 0.4, 0);
          if (!r.landed) {
            r.landed = true;
            smokePuff(smoke, r.h.x, r.h.y + 0.2, 10, 3, r.h.width * 1.4, 0.5, 0.45, 0.4, 0.55);
          }
        } else r.landed = false;
        // Dust drifts down from the ceiling while the shadow grows
        if (ph === 'telegraph' && !reduceMotion && Math.floor(tSec * 20) % 3 === 0) smokePuff(smoke, r.h.x, r.h.y + r.h.height, 1, -1.5, r.h.width, 0.45, 0.42, 0.4, 0.3);
      }
      for (const sv of switchViews) {
        const st = w.switches.find((s) => s.id === sv.sp.id);
        const on = !!st?.on;
        const m = sv.head.material as THREE.MeshStandardMaterial;
        m.emissive.setHex(on ? 0x33ff66 : 0xff3322);
        m.emissiveIntensity = on ? 1.6 : 0.9 + 0.5 * Math.sin(tSec * 5);
        sv.head.rotation.z = on ? 0.7 : 0;
      }
      for (const lv of liftViews) {
        const st = w.elevators.find((e) => e.id === lv.e.id);
        const y = st ? st.y : lv.e.bottomY;
        lv.car.position.set((lv.s.minX + lv.s.maxX) / 2, y - 0.14, 0);
        const m = lv.car.material as THREE.MeshStandardMaterial;
        m.emissiveIntensity = st && st.phase === 'rising' ? 0.9 : st && st.phase === 'bottom' && st.timer > 0 ? 0.4 + 0.5 * Math.sin(tSec * 14) : 0.35;
      }
      for (const b of bridgeViews) {
        const open = w.openDoors.has(b.s.bridgeId!);
        b.k += ((open ? 1 : 0) - b.k) * Math.min(1, dt * 5);
        b.m.visible = b.k > 0.02;
        const len = (b.s.maxX - b.s.minX) * b.k;
        b.m.scale.x = Math.max(0.01, len);
        b.m.position.set(b.s.minX + len / 2, (b.s.minY + b.s.maxY) / 2, 0);
      }
      for (const sg of segViews) {
        const id = sg.solid.collapseId!;
        const fallen = w.openDoors.has(id);
        const crumbling = w.collapses.some((c) => c.crumbling.includes(sg.solid.id));
        const mat = sg.mesh.material as THREE.MeshStandardMaterial;
        mat.emissiveIntensity = crumbling && !fallen ? 0.6 + 0.4 * Math.sin(tSec * 40) : 0;
        const baseX = (sg.solid.minX + sg.solid.maxX) / 2;
        const baseY = (sg.solid.minY + sg.solid.maxY) / 2;
        if (!fallen) {
          sg.fall = 0;
          sg.vy = 0;
          sg.rot = 0;
          sg.mesh.visible = true;
          const jit = crumbling && !reduceMotion ? Math.sin(tSec * 80 + baseX) * 0.05 : 0;
          sg.mesh.position.set(baseX, baseY + jit, 0);
          sg.mesh.rotation.z = 0;
        } else if (sg.mesh.visible) {
          sg.vy += 24 * dt;
          sg.fall += sg.vy * dt;
          sg.rot += dt * 1.6;
          sg.mesh.position.set(baseX, baseY - sg.fall, 0);
          sg.mesh.rotation.z = sg.rot * (baseX % 2 > 1 ? -1 : 1);
          if (sg.fall > 9) sg.mesh.visible = false;
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
