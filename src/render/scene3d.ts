// Real-time 2.5D Three.js WebGL2 renderer for REANIMATOR.
// Draws only; never mutates the simulation World. Supports full Canvas2D fallback if WebGL is unavailable.
import * as THREE from 'three';
import { TILE } from '../engine/collider.ts';
import { MAP, CORE, EXIT, HAZARDS, RULES, type World } from '../game/world.ts';
import {
  getModelsVersion,
  instantiateModel,
  MODEL_CONFIG,
  preloadModels,
  tintMaterials,
  type ModelId,
} from './models.ts';

export const VIEW3D_W = 1280;
export const VIEW3D_H = 800;

export interface RenderView {
  px: number;
  py: number;
  aimX: number;
  aimY: number;
  flash: number;
  dt: number;
}

export interface Scene3DRenderer {
  render(w: World, v: RenderView, reducedFlash: boolean): { x: number; y: number };
  screenToWorld(normX: number, normY: number): { x: number; y: number };
  dispose(): void;
}

interface ActorHandle {
  root: THREE.Group;
  modelHolder: THREE.Group;
  materials: THREE.MeshStandardMaterial[];
  isReal: boolean;
  yaw: number;
  modelId: ModelId;
  chargeOrb?: THREE.Mesh;
}

interface Spark {
  mesh: THREE.Mesh;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
}

function makeBulkheadTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#252c36';
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = '#384352';
  g.lineWidth = 4;
  g.strokeRect(4, 4, 120, 120);
  g.strokeStyle = '#181e26';
  g.lineWidth = 2;
  g.strokeRect(18, 18, 92, 92);
  g.fillStyle = '#3f4b5c';
  for (const [rx, ry] of [[12, 12], [112, 12], [12, 112], [112, 112]]) {
    g.fillRect(rx - 2, ry - 2, 4, 4);
  }
  // subtle warning band across center
  g.fillStyle = '#2c3542';
  g.fillRect(20, 58, 88, 12);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function makeBackplateTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#0c1016';
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = '#161e29';
  g.lineWidth = 2;
  g.strokeRect(2, 2, 124, 124);
  g.fillStyle = '#111720';
  g.fillRect(10, 10, 108, 46);
  g.fillRect(10, 70, 108, 46);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function buildFacility(scene: THREE.Scene): void {
  const solids: { tx: number; ty: number }[] = [];
  const backs: { tx: number; ty: number }[] = [];
  const trims: { x: number; y: number }[] = [];
  const ribs: { x: number; y: number }[] = [];

  for (let ty = 0; ty < MAP.h; ty++) {
    for (let tx = 0; tx < MAP.w; tx++) {
      if (MAP.solid(tx, ty)) {
        solids.push({ tx, ty });
        if (ty > 0 && !MAP.solid(tx, ty - 1)) {
          trims.push({ x: (tx + 0.5) * TILE, y: -ty * TILE - 1 });
        }
      } else {
        backs.push({ tx, ty });
        if (tx % 6 === 0) {
          ribs.push({ x: (tx + 0.5) * TILE, y: -(ty + 0.5) * TILE });
        }
      }
    }
  }

  const blockGeo = new THREE.BoxGeometry(TILE, TILE, 28);
  const blockMat = new THREE.MeshStandardMaterial({
    map: makeBulkheadTexture(),
    color: 0xb8c8dc,
    roughness: 0.55,
    metalness: 0.42,
  });
  const blockMesh = new THREE.InstancedMesh(blockGeo, blockMat, solids.length);
  const dummy = new THREE.Object3D();
  solids.forEach((s, i) => {
    dummy.position.set((s.tx + 0.5) * TILE, -(s.ty + 0.5) * TILE, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    blockMesh.setMatrixAt(i, dummy.matrix);
  });
  blockMesh.instanceMatrix.needsUpdate = true;
  scene.add(blockMesh);

  // Metallic top edge trim so platforms and steps pop cleanly even in dim light
  if (trims.length > 0) {
    const trimGeo = new THREE.BoxGeometry(TILE, 2.2, 29.2);
    const trimMat = new THREE.MeshStandardMaterial({
      color: 0x7a93ad,
      emissive: 0x162433,
      roughness: 0.35,
      metalness: 0.75,
    });
    const trimMesh = new THREE.InstancedMesh(trimGeo, trimMat, trims.length);
    trims.forEach((t, i) => {
      dummy.position.set(t.x, t.y, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      trimMesh.setMatrixAt(i, dummy.matrix);
    });
    trimMesh.instanceMatrix.needsUpdate = true;
    scene.add(trimMesh);
  }

  // Recessed dark industrial backwall at z = -17
  const backGeo = new THREE.PlaneGeometry(TILE, TILE);
  const backMat = new THREE.MeshStandardMaterial({
    map: makeBackplateTexture(),
    color: 0x8598ad,
    roughness: 0.82,
    metalness: 0.25,
  });
  const backMesh = new THREE.InstancedMesh(backGeo, backMat, backs.length);
  backs.forEach((b, i) => {
    dummy.position.set((b.tx + 0.5) * TILE, -(b.ty + 0.5) * TILE, -17);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    backMesh.setMatrixAt(i, dummy.matrix);
  });
  backMesh.instanceMatrix.needsUpdate = true;
  scene.add(backMesh);

  // Structural vertical pillars & ceiling pipes for depth parallax
  if (ribs.length > 0) {
    const ribGeo = new THREE.BoxGeometry(4, TILE, 5);
    const ribMat = new THREE.MeshStandardMaterial({ color: 0x202936, roughness: 0.7, metalness: 0.6 });
    const ribMesh = new THREE.InstancedMesh(ribGeo, ribMat, ribs.length);
    ribs.forEach((r, i) => {
      dummy.position.set(r.x, r.y, -14.5);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      ribMesh.setMatrixAt(i, dummy.matrix);
    });
    ribMesh.instanceMatrix.needsUpdate = true;
    scene.add(ribMesh);
  }

  // Horizontal overhead conduit pipes across the 4 sectors
  const pipeMat = new THREE.MeshStandardMaterial({ color: 0x453b2e, roughness: 0.55, metalness: 0.7 });
  for (const pipeTy of [4, 15, 29]) {
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, MAP.w * TILE, 8), pipeMat);
    pipe.rotation.z = Math.PI / 2;
    pipe.position.set((MAP.w * TILE) / 2, -pipeTy * TILE, -12.5);
    scene.add(pipe);
  }

  // Emissive H bio-sludge hazard grates
  if (HAZARDS.length > 0) {
    const hazGeo = new THREE.BoxGeometry(TILE - 1, 3.5, 24);
    const hazMat = new THREE.MeshStandardMaterial({
      color: 0x164024,
      emissive: 0x22e868,
      emissiveIntensity: 1.5,
      roughness: 0.2,
    });
    const hazMesh = new THREE.InstancedMesh(hazGeo, hazMat, HAZARDS.length);
    HAZARDS.forEach((h, i) => {
      dummy.position.set((h.tx + 0.5) * TILE, -(h.ty + 1) * TILE + 1.8, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      hazMesh.setMatrixAt(i, dummy.matrix);
    });
    hazMesh.instanceMatrix.needsUpdate = true;
    scene.add(hazMesh);
  }
}

export function createScene3D(canvas: HTMLCanvasElement): Scene3DRenderer | null {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  } catch {
    return null;
  }
  const gl = renderer.getContext();
  if (!gl) {
    renderer.dispose();
    return null;
  }

  preloadModels();

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(VIEW3D_W, VIEW3D_H, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x060a10);
  scene.fog = new THREE.FogExp2(0x060a10, 0.0014);

  const camera = new THREE.PerspectiveCamera(42, VIEW3D_W / VIEW3D_H, 4, 1500);
  camera.position.set(160, -484, 236);

  // Bounded 5-light physical candela rig (decay = 1)
  const hemi = new THREE.HemisphereLight(0x7da6d4, 0x182230, 0.75);
  scene.add(hemi);
  const rimDir = new THREE.DirectionalLight(0xa8ceff, 1.1);
  rimDir.position.set(0.35, 0.95, 1.35);
  scene.add(rimDir);

  const playerAura = new THREE.PointLight(0x9ed0ff, 180, 150, 1);
  scene.add(playerAura);

  const spotTarget = new THREE.Object3D();
  scene.add(spotTarget);
  const headSpot = new THREE.SpotLight(0xfff0c4, 1150, 340, 0.46, 0.65, 1);
  headSpot.target = spotTarget;
  scene.add(headSpot);

  const alarmLight = new THREE.PointLight(0xff2424, 0, 260, 1);
  scene.add(alarmLight);

  buildFacility(scene);

  // ---- Actor factory + hot-swap tracker for async GLBs ----
  const actors = new Map<string, ActorHandle>();
  let syncedVersion = -1;

  function ensureActor(key: string, modelId: ModelId, parent: THREE.Scene, withChargeColor?: number): ActorHandle {
    let h = actors.get(key);
    const curVer = getModelsVersion();
    if (!h) {
      const root = new THREE.Group();
      const inst = instantiateModel(modelId);
      root.add(inst.group);
      let chargeOrb: THREE.Mesh | undefined;
      if (withChargeColor !== undefined) {
        chargeOrb = new THREE.Mesh(
          new THREE.SphereGeometry(5, 12, 12),
          new THREE.MeshBasicMaterial({ color: withChargeColor, transparent: true, opacity: 0.88 }),
        );
        chargeOrb.visible = false;
        root.add(chargeOrb);
      }
      parent.add(root);
      h = {
        root,
        modelHolder: inst.group,
        materials: inst.materials,
        isReal: inst.isReal,
        yaw: MODEL_CONFIG[modelId].yawRight,
        modelId,
        chargeOrb,
      };
      actors.set(key, h);
    } else if (!h.isReal && curVer !== syncedVersion) {
      const inst = instantiateModel(modelId);
      if (inst.isReal) {
        h.root.remove(h.modelHolder);
        h.root.add(inst.group);
        h.modelHolder = inst.group;
        h.materials = inst.materials;
        h.isReal = true;
      }
    }
    return h;
  }

  // ---- Player rifle, laser sight & volumetric headlamp beam ----
  const gunPivot = new THREE.Group();
  const rifleMat = new THREE.MeshStandardMaterial({ color: 0x1a222c, metalness: 0.72, roughness: 0.44 });
  const gunBody = new THREE.Mesh(new THREE.BoxGeometry(9.5, 1.8, 1.7), rifleMat);
  gunBody.position.set(5.2, 0, 0);
  const gunShroud = new THREE.Mesh(new THREE.BoxGeometry(5.0, 1.2, 1.4), rifleMat);
  gunShroud.position.set(4.5, -0.8, 0);
  const gunTip = new THREE.Mesh(
    new THREE.BoxGeometry(2.0, 1.1, 1.2),
    new THREE.MeshStandardMaterial({ color: 0x52e5ff, emissive: 0x38d9ff, emissiveIntensity: 2.0 }),
  );
  gunTip.position.set(10.5, 0, 0);
  const laserMat = new THREE.LineBasicMaterial({ color: 0x4de6ff, transparent: true, opacity: 0.36 });
  const laserLine = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(10.5, 0, 0), new THREE.Vector3(165, 0, 0)]),
    laserMat,
  );
  const muzzleFlash = new THREE.Mesh(
    new THREE.SphereGeometry(2.0, 8, 8),
    new THREE.MeshBasicMaterial({
      color: 0xfff0aa,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  muzzleFlash.position.set(12.0, 0, 0);
  muzzleFlash.visible = false;
  gunPivot.add(gunBody, gunShroud, gunTip, laserLine, muzzleFlash);
  scene.add(gunPivot);

  // Volumetric headlamp cone oriented along +X around pivot
  const coneLen = 195;
  const coneGeo = new THREE.ConeGeometry(44, coneLen, 24, 1, true);
  coneGeo.translate(0, -coneLen / 2, 0);
  coneGeo.rotateZ(Math.PI / 2);
  const beamMat = new THREE.MeshBasicMaterial({
    color: 0xf7e8a8,
    transparent: true,
    opacity: 0.045,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const beamCone = new THREE.Mesh(coneGeo, beamMat);
  scene.add(beamCone);

  // ---- Nano-Med Stations ----
  const medMeshes: { base: THREE.Mesh; cross: THREE.Mesh; ring: THREE.Mesh }[] = [];
  const wInit = MAP.find('M');
  wInit.forEach((m) => {
    const x = m.tx * TILE + TILE / 2;
    const y = -(m.ty + 1) * TILE;
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(5, 6, 3, 12),
      new THREE.MeshStandardMaterial({ color: 0x263440, metalness: 0.7, roughness: 0.35 }),
    );
    base.position.set(x, y + 1.5, 0);
    const cross = new THREE.Mesh(
      new THREE.OctahedronGeometry(4.5, 0),
      new THREE.MeshStandardMaterial({ color: 0x28ff95, emissive: 0x1ee87d, emissiveIntensity: 1.8 }),
    );
    cross.position.set(x, y + 11, 0);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(6.5, 0.7, 6, 20),
      new THREE.MeshBasicMaterial({ color: 0x3effa2, transparent: true, opacity: 0.5 }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.set(x, y + 3, 0);
    scene.add(base, cross, ring);
    medMeshes.push({ base, cross, ring });
  });

  // ---- Exit gate aura ring & light bar ----
  const exitBeacon = new THREE.Mesh(
    new THREE.TorusGeometry(18, 1.3, 8, 28),
    new THREE.MeshStandardMaterial({ color: 0xff3b3b, emissive: 0xff2b2b, emissiveIntensity: 2.0 }),
  );
  exitBeacon.position.set(EXIT.x, -EXIT.y + 23, -6);
  scene.add(exitBeacon);

  // ---- Dynamic pools: Bullets & Particles ----
  const pulseGeo = new THREE.SphereGeometry(2.4, 8, 8);
  const pulseMat = new THREE.MeshBasicMaterial({ color: 0xffe484 });
  const railGeo = new THREE.CylinderGeometry(1.5, 1.5, 20, 8);
  railGeo.rotateZ(Math.PI / 2);
  const railMat = new THREE.MeshBasicMaterial({ color: 0x5ef2ff });
  const enemyOrbGeo = new THREE.SphereGeometry(3.8, 10, 10);
  const enemyOrbMat = new THREE.MeshBasicMaterial({ color: 0x6dff57 });
  const bulletGroup = new THREE.Group();
  scene.add(bulletGroup);
  const bulletPool: THREE.Mesh[] = [];

  const sparkGeo = new THREE.BoxGeometry(1.2, 1.2, 1.2);
  const sparks: Spark[] = [];
  function spawnSparks(x: number, y: number, color: number, count: number, speed = 55) {
    for (let i = 0; i < count; i++) {
      if (sparks.length >= 140) break;
      const m = new THREE.Mesh(
        sparkGeo,
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 1,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      m.position.set(x, y, 2);
      scene.add(m);
      const ang = Math.random() * Math.PI * 2;
      const spd = speed * (0.35 + Math.random() * 0.85);
      sparks.push({
        mesh: m,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd + 18,
        vz: (Math.random() - 0.5) * 35,
        life: 0.35,
        maxLife: 0.35,
      });
    }
  }

  let camX = 160;
  let camY = -490;
  let shake = 0;
  let muzzleTimer = 0;
  let lastShots = 0;
  let lastRailShots = 0;
  let lastKills = 0;
  let lastHp: number = RULES.playerHp;
  let lastCrawlerHp: number[] = [];
  let lastSpitterHp: number[] = [];
  let lastWardenHp: number = RULES.wardenHp;

  const aimPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  const raycaster = new THREE.Raycaster();
  const rayHit = new THREE.Vector3();

  return {
    render(w: World, v: RenderView, reducedFlash: boolean) {
      const dt = Math.min(0.05, Math.max(0.001, v.dt));
      const nowSec = performance.now() / 1000;

      // Reset event trackers on new run
      if (w.tick <= 1 && lastShots > w.shots) {
        lastShots = 0;
        lastRailShots = 0;
        lastKills = 0;
        lastHp = w.hp;
        lastCrawlerHp = w.crawlers.map((c) => c.hp);
        lastSpitterHp = w.spitters.map((s) => s.hp);
        lastWardenHp = w.warden?.hp ?? 0;
      }

      // Trigger juice events from pure World diffs
      if (w.shots > lastShots) {
        muzzleTimer = 0.06;
        const isRail = w.railShots > lastRailShots;
        if (isRail && !reducedFlash) shake = Math.max(shake, 4.2);
        spawnSparks(v.px + w.player.dir * 10, -(v.py - 18), isRail ? 0x52f2ff : 0xffdf7a, isRail ? 12 : 4, isRail ? 110 : 60);
      }
      if (w.hp < lastHp && !reducedFlash) {
        shake = Math.max(shake, 6.0);
        spawnSparks(v.px, -(v.py - 16), 0xff3b3b, 14, 90);
      }
      w.crawlers.forEach((c, i) => {
        if (lastCrawlerHp[i] !== undefined && c.hp < lastCrawlerHp[i]) {
          spawnSparks(c.x, -(c.y - 10), c.hp <= 0 ? 0xff5a36 : 0xffdf99, c.hp <= 0 ? 18 : 6, c.hp <= 0 ? 110 : 65);
        }
        lastCrawlerHp[i] = c.hp;
      });
      w.spitters.forEach((s, i) => {
        if (lastSpitterHp[i] !== undefined && s.hp < lastSpitterHp[i]) {
          spawnSparks(s.x, -(s.y - 8), s.hp <= 0 ? 0x45ff79 : 0xfff0aa, s.hp <= 0 ? 18 : 6, 95);
        }
        lastSpitterHp[i] = s.hp;
      });
      if (w.warden && w.warden.hp < lastWardenHp) {
        spawnSparks(w.warden.x, -(w.warden.y - 20), w.warden.hp <= 0 ? 0xff9d2e : 0xffe484, w.warden.hp <= 0 ? 28 : 8, 120);
      }
      if (w.kills > lastKills && !reducedFlash) shake = Math.max(shake, 3.0);
      lastShots = w.shots;
      lastRailShots = w.railShots;
      lastKills = w.kills;
      lastHp = w.hp;
      lastWardenHp = w.warden?.hp ?? 0;

      // Update sparks
      for (let i = sparks.length - 1; i >= 0; i--) {
        const sp = sparks[i];
        sp.life -= dt;
        if (sp.life <= 0) {
          scene.remove(sp.mesh);
          (sp.mesh.material as THREE.Material).dispose();
          sparks.splice(i, 1);
          continue;
        }
        sp.vy -= 140 * dt;
        sp.mesh.position.x += sp.vx * dt;
        sp.mesh.position.y += sp.vy * dt;
        sp.mesh.position.z += sp.vz * dt;
        (sp.mesh.material as THREE.MeshBasicMaterial).opacity = sp.life / sp.maxLife;
      }

      // ---- Camera with smooth look-ahead & bounds clamping ----
      const lookOffset = Math.max(-42, Math.min(42, (v.aimX - v.px) * 0.16));
      const wantX = Math.max(165, Math.min(MAP.w * TILE - 165, v.px + lookOffset));
      const wantY = Math.max(-(MAP.h * TILE - 92), Math.min(-92, -(v.py - 26)));
      camX += (wantX - camX) * Math.min(1, dt * 8.5);
      camY += (wantY - camY) * Math.min(1, dt * 7.0);
      const sx = reducedFlash || shake <= 0 ? 0 : (Math.random() - 0.5) * shake;
      const sy = reducedFlash || shake <= 0 ? 0 : (Math.random() - 0.5) * shake;
      shake = Math.max(0, shake - dt * 22);
      camera.position.set(camX + sx, camY + sy, 236);
      camera.lookAt(camX, camY, 0);

      // ---- Dynamic Darkness & Headlamp (R3.3 visual-only) ----
      const lightOn = w.light.on;
      hemi.intensity = lightOn ? 1.15 : 0.48;
      rimDir.intensity = lightOn ? 1.45 : 0.72;
      playerAura.position.set(v.px, -(v.py - 18), 38);
      playerAura.distance = lightOn ? 250 : 105;
      playerAura.intensity = lightOn ? 340 : 155;

      const ox = v.px;
      const oy = -(v.py - 18);
      const aimAngle = Math.atan2(-v.aimY - oy, v.aimX - ox);
      headSpot.position.set(ox, oy, 44);
      spotTarget.position.set(ox + Math.cos(aimAngle) * 190, oy + Math.sin(aimAngle) * 190, -4);
      headSpot.intensity = lightOn ? 1150 : 0;
      beamCone.visible = lightOn;
      beamCone.position.set(ox + Math.cos(aimAngle) * 6, oy + Math.sin(aimAngle) * 6, 4);
      beamCone.rotation.z = aimAngle;
      beamMat.opacity = lightOn ? 0.045 : 0;

      if (w.hasCore && !reducedFlash) {
        const pulse = 0.5 + 0.5 * Math.sin(nowSec * 7.5);
        alarmLight.color.setHex(0xff2424);
        alarmLight.distance = 320;
        alarmLight.position.set(camX, camY + 55, 55);
        alarmLight.intensity = 140 + pulse * 280;
      } else if (!w.hasCore) {
        alarmLight.color.setHex(0x38dcff);
        alarmLight.distance = 220;
        alarmLight.position.set(CORE.x, -CORE.y + 18, 36);
        alarmLight.intensity = 320;
      } else {
        alarmLight.intensity = 0;
      }

      // ---- Player Operative & 360 Rifle ----
      const pActor = ensureActor('player', 'operative', scene);
      const targetYaw = w.player.dir > 0 ? MODEL_CONFIG.operative.yawRight - 0.24 : -MODEL_CONFIG.operative.yawRight + 0.24;
      pActor.yaw += (targetYaw - pActor.yaw) * Math.min(1, dt * 16);
      pActor.modelHolder.rotation.y = pActor.yaw;

      const blink = w.invuln > 0 && Math.floor(w.invuln / 2) % 2 === 0 && !reducedFlash;
      pActor.root.visible = !blink;
      let bobY = 0;
      let pitch = 0;
      let syScale = 1;
      if (w.player.state === 10) {
        bobY = Math.abs(Math.sin(nowSec * 14)) * 1.8;
        pitch = -w.player.dir * 0.08;
      } else if (w.player.state === 4) {
        syScale = 1.04;
        pitch = w.player.dir * 0.06;
      } else if (w.player.state === 6) {
        syScale = 0.90;
      }
      pActor.root.position.set(v.px, -v.py + bobY, 0);
      pActor.root.rotation.z = pitch;
      pActor.root.scale.set(1, syScale, 1);
      tintMaterials(pActor.materials, 0xff2a2a, w.invuln > 10 && !reducedFlash ? 0.6 : 0);

      gunPivot.visible = !blink;
      gunPivot.position.set(ox, oy + bobY * 0.6, 5.5);
      gunPivot.rotation.z = aimAngle;
      if (muzzleTimer > 0) {
        muzzleTimer -= dt;
        muzzleFlash.visible = true;
      } else {
        muzzleFlash.visible = false;
      }

      // ---- Crawlers (Skitter-Husks) ----
      w.crawlers.forEach((k) => {
        const key = `crawler_${k.id}`;
        if (k.dormant || k.hp <= 0) {
          const prevA = actors.get(key);
          if (prevA) prevA.root.visible = false;
          return;
        }
        const a = ensureActor(key, 'crawler', scene);
        a.root.visible = true;
        const tYaw = k.dir > 0 ? MODEL_CONFIG.crawler.yawRight - 0.18 : -MODEL_CONFIG.crawler.yawRight + 0.18;
        a.yaw += (tYaw - a.yaw) * Math.min(1, dt * 14);
        a.modelHolder.rotation.y = a.yaw;
        const scuttle = Math.abs(Math.sin(nowSec * 11 + k.id * 1.7)) * 1.2;
        const jx = k.stagger > 0 && !reducedFlash ? Math.sin(nowSec * 45) * 1.4 : 0;
        a.root.position.set(k.x + jx, -k.y + scuttle, 0);
        if (k.hurt > 0 && !reducedFlash) tintMaterials(a.materials, 0xffffff, 0.75);
        else if (k.stagger > 0) tintMaterials(a.materials, 0x3de8ff, 0.5);
        else tintMaterials(a.materials, 0x000000, 0);
      });

      // ---- Spitters (Spore-Sentinels) ----
      w.spitters.forEach((s) => {
        const key = `spitter_${s.id}`;
        if (s.dormant || s.hp <= 0) {
          const prevA = actors.get(key);
          if (prevA) prevA.root.visible = false;
          return;
        }
        const a = ensureActor(key, 'spitter', scene, 0x6dff57);
        a.root.visible = true;
        const tYaw = s.dir > 0 ? MODEL_CONFIG.spitter.yawRight - 0.25 : -MODEL_CONFIG.spitter.yawRight + 0.25;
        a.yaw += (tYaw - a.yaw) * Math.min(1, dt * 12);
        a.modelHolder.rotation.y = a.yaw;
        a.root.position.set(s.x, -(s.y + 1), 0);
        if (s.hurt > 0 && !reducedFlash) tintMaterials(a.materials, 0xffffff, 0.75);
        else if (s.stagger > 0) tintMaterials(a.materials, 0x3de8ff, 0.5);
        else if (s.charge > 0) tintMaterials(a.materials, 0x45ff6b, 0.45 * (s.charge / RULES.spitterChargeTicks));
        else tintMaterials(a.materials, 0x000000, 0);

        if (a.chargeOrb) {
          a.chargeOrb.visible = s.charge > 0;
          if (s.charge > 0) {
            const p = Math.min(1, s.charge / RULES.spitterChargeTicks);
            a.chargeOrb.position.set(s.dir * 8, 9, 5);
            a.chargeOrb.scale.setScalar(0.3 + p * 0.9);
          }
        }
      });

      // ---- Core Warden (Sector C Boss) ----
      if (w.warden) {
        const wd = w.warden;
        if (wd.hp <= 0) {
          const prevA = actors.get('warden');
          if (prevA) prevA.root.visible = false;
        } else {
          const a = ensureActor('warden', 'warden', scene, 0xff9a2e);
          a.root.visible = true;
          const tYaw = wd.dir > 0 ? MODEL_CONFIG.warden.yawRight - 0.26 : -MODEL_CONFIG.warden.yawRight + 0.26;
          a.yaw += (tYaw - a.yaw) * Math.min(1, dt * 10);
          a.modelHolder.rotation.y = a.yaw;
          const stepBob = wd.charge > 0 ? 0 : Math.abs(Math.sin(nowSec * 7)) * 1.4;
          const jx = wd.stagger > 0 && !reducedFlash ? Math.sin(nowSec * 40) * 1.8 : 0;
          a.root.position.set(wd.x + jx, -wd.y + stepBob, 0);
          if (wd.hurt > 0 && !reducedFlash) tintMaterials(a.materials, 0xffffff, 0.75);
          else if (wd.stagger > 0) tintMaterials(a.materials, 0x42ecff, 0.5);
          else if (wd.charge > 0) tintMaterials(a.materials, 0xff8c1a, 0.5 * (wd.charge / RULES.wardenChargeTicks));
          else tintMaterials(a.materials, 0x000000, 0);

          if (a.chargeOrb) {
            a.chargeOrb.visible = wd.charge > 0;
            if (wd.charge > 0) {
              const p = Math.min(1, wd.charge / RULES.wardenChargeTicks);
              a.chargeOrb.position.set(wd.dir * 12, 22, 7);
              a.chargeOrb.scale.setScalar(0.4 + p * 1.2);
            }
          }
        }
      }

      // ---- Objectives: Power Core & Exit Gate ----
      const coreActor = ensureActor('power-core', 'power-core', scene);
      coreActor.root.visible = !w.hasCore;
      if (!w.hasCore) {
        coreActor.root.position.set(CORE.x, -CORE.y + 4 + Math.sin(nowSec * 2.5) * 2.5, -2);
        coreActor.modelHolder.rotation.y = nowSec * 1.4;
        tintMaterials(coreActor.materials, 0x38d8ff, 0.12 + 0.08 * Math.sin(nowSec * 5));
      }

      const gateActor = ensureActor('exit-gate', 'exit-gate', scene);
      gateActor.root.visible = true;
      gateActor.root.position.set(EXIT.x, -EXIT.y, -9);
      gateActor.modelHolder.rotation.y = MODEL_CONFIG['exit-gate'].yawFront;
      tintMaterials(gateActor.materials, w.hasCore ? 0x2cff86 : 0xff3b3b, w.hasCore ? 0.16 : 0.06);
      const beaconMat = exitBeacon.material as THREE.MeshStandardMaterial;
      beaconMat.color.setHex(w.hasCore ? 0x35ff88 : 0xff3535);
      beaconMat.emissive.setHex(w.hasCore ? 0x25e878 : 0xd82020);
      beaconMat.emissiveIntensity = w.hasCore ? 1.8 + 0.9 * Math.sin(nowSec * 6) : 1.1;

      // ---- MedStations ----
      w.meds.forEach((m, i) => {
        const mm = medMeshes[i];
        if (!mm) return;
        mm.cross.visible = !m.used;
        mm.ring.visible = !m.used;
        if (!m.used) {
          mm.cross.rotation.y = nowSec * 2.2 + i;
          mm.cross.position.y = -m.y + 11 + Math.sin(nowSec * 3.5 + i) * 1.8;
        }
      });

      // ---- Projectiles (Player pulse, Rail-Slug, Enemy Orbs) ----
      const totalProj = w.bullets.length + w.enemyBullets.length;
      while (bulletPool.length < totalProj) {
        const mesh = new THREE.Mesh(pulseGeo, pulseMat);
        bulletGroup.add(mesh);
        bulletPool.push(mesh);
      }
      let bi = 0;
      for (const b of w.bullets) {
        const m = bulletPool[bi++];
        m.visible = true;
        m.geometry = b.piercing ? railGeo : pulseGeo;
        m.material = b.piercing ? railMat : pulseMat;
        m.position.set(b.x, -b.y, 4);
        m.rotation.z = Math.atan2(-b.vy, b.vx);
      }
      for (const eb of w.enemyBullets) {
        const m = bulletPool[bi++];
        m.visible = true;
        m.geometry = enemyOrbGeo;
        m.material = enemyOrbMat;
        m.position.set(eb.x, -eb.y, 3.5);
        m.rotation.z = 0;
      }
      for (let i = bi; i < bulletPool.length; i++) bulletPool[i].visible = false;

      syncedVersion = getModelsVersion();
      renderer.render(scene, camera);

      return { x: camX - VIEW3D_W * 0.25, y: -camY - VIEW3D_H * 0.25 };
    },

    screenToWorld(normX: number, normY: number) {
      const ndc = new THREE.Vector2(normX * 2 - 1, -(normY * 2 - 1));
      raycaster.setFromCamera(ndc, camera);
      const hit = raycaster.ray.intersectPlane(aimPlane, rayHit);
      if (!hit) return { x: camX, y: -camY };
      return { x: hit.x, y: -hit.y };
    },

    dispose() {
      renderer.dispose();
    },
  };
}
