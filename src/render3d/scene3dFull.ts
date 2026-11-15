// Full 3D Side-View Metroidvania Three.js WebGL2 Renderer for REANIMATOR.
// The camera looks down -Z at the z = 0 gameplay lane (2.5D). Drives rigged SkinnedMesh animations via AnimationMixer,
// two-handed rifle IK (riggedModels.ts), z = 0 cursor raycasting, selective UnrealBloomPass, PCFShadowMap,
// 60 -> display-rate interpolation, and the R3.3 visual-only headlamp.

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import type { SectorId3D } from '../game3d/types3d.ts';
import type { MapSolid3D, Ramp3D, WeaponSlot3D } from '../game3d/map3d.ts';
import { getPlayerPose3D, type ActorAnimAction, type WorldState3D } from '../game3d/world3d.ts';
import {
  flashMaterials3D,
  flashRiggedMaterials3D,
  getFailedModelNames3D,
  getLoadedModelNames3D,
  instantiateRiggedModel3D,
  instantiateStaticModel3D,
  preloadAllModels3D,
  stepRiggedAnimation3D,
  stepRiggedEnemyAnimation3D,
  tuneEnemyMaterials3D,
  type RiggedInstance,
} from './riggedModels.ts';
import { getFacilityTextures3D } from './textures3d.ts';
import { buildDecor3D, SECTOR_FOG, type Decor3D } from './decor3d.ts';

interface StaticActorHandle {
  root: THREE.Group;
  materials: THREE.MeshStandardMaterial[];
  baseEmissive: THREE.Color[];
  baseScale: number;
}

interface OccludableMesh {
  mesh: THREE.Mesh;
  mat: THREE.MeshStandardMaterial;
  center: THREE.Vector3;
}

function buildRampGeometry(r: Ramp3D): THREE.BufferGeometry {
  const geom = new THREE.BoxGeometry(1, 1, 1);
  const pos = geom.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const lx = pos.getX(i); // -0.5..0.5
    const ly = pos.getY(i); // -0.5..0.5
    const lz = pos.getZ(i); // -0.5..0.5
    const wx = r.minX + (lx + 0.5) * (r.maxX - r.minX);
    const wz = r.minZ + (lz + 0.5) * (r.maxZ - r.minZ);
    const t = r.axis === 'x' ? lx + 0.5 : lz + 0.5;
    const topY = r.yMinEdge + (r.yMaxEdge - r.yMinEdge) * t;
    const wy = ly > 0 ? topY : topY - r.thickness;
    pos.setXYZ(i, wx, wy, wz);
  }
  geom.computeVertexNormals();
  return geom;
}

const DOOR_COLORS: Record<string, number> = {
  blue: 0x3a8cff,
  green: 0x3aff6a,
  yellow: 0xffc933,
  red: 0xff2a3c,
  console: 0x2bf0ff,
  escape: 0xff4a2a,
};

function turnToward(current: number, target: number, dt: number, rate = 16): number {
  let d = target - current;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return current + d * Math.min(1, dt * rate);
}

/** Per-enemy render-only smoothing state (never read by the sim). */
interface EnemyViz {
  yaw: number;
  lean: number;
  recoil: number;
  prevHit: number;
  shot: number;
  prevWindup: number;
  phase: number;
}

const ENEMY_TINT_3D: Record<string, number> = { stalker: 0xd8f5d0, crawler: 0xf0c8b8, spitter: 0xdcc8f5, warden: 0xffd8b0 };
const ENEMY_WINDUP_TOTAL_3D: Record<string, number> = { crawler: 14, stalker: 18, spitter: 12, warden: 36 };
const ENEMY_FLASH_HEX_3D = 0xff5a28;
const TELEGRAPH_POOL_3D = 6;

function wrapAngle(d: number): number {
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

interface PosSnap {
  x: number;
  y: number;
}

const SECTOR_LIGHT: Record<SectorId3D, { sky: THREE.Color; sun: THREE.Color; ambient: number; sunI: number; bloom: number }> = {
  airlock: { sky: new THREE.Color(0x8bb6df), sun: new THREE.Color(0xdcebff), ambient: 1.35, sunI: 1.9, bloom: 0.32 },
  shaft: { sky: new THREE.Color(0x86a9c8), sun: new THREE.Color(0xd4e4f5), ambient: 1.4, sunI: 1.8, bloom: 0.3 },
  mines: { sky: new THREE.Color(0xb59a78), sun: new THREE.Color(0xffd9a8), ambient: 1.3, sunI: 1.7, bloom: 0.36 },
  biolabs: { sky: new THREE.Color(0x8fd1a8), sun: new THREE.Color(0xd2f5dc), ambient: 1.35, sunI: 1.7, bloom: 0.4 },
  security: { sky: new THREE.Color(0x9ab0d6), sun: new THREE.Color(0xe6eeff), ambient: 1.45, sunI: 1.9, bloom: 0.34 },
  core: { sky: new THREE.Color(0xc08a8a), sun: new THREE.Color(0xffc4b0), ambient: 1.3, sunI: 1.8, bloom: 0.4 },
};

export class Scene3DRenderer {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly composer: EffectComposer;
  private readonly bloomPass: UnrealBloomPass;
  private readonly raycaster = new THREE.Raycaster();
  private readonly sun: THREE.DirectionalLight;
  private readonly ambient: THREE.HemisphereLight;
  private readonly alarmLight: THREE.PointLight;
  private readonly headlamp: THREE.SpotLight;
  private readonly headlampTarget = new THREE.Object3D();
  private readonly headlampCone: THREE.Mesh;
  private readonly muzzleLight: THREE.PointLight;
  private readonly fillLight: THREE.PointLight;
  private readonly laserLine: THREE.Line;
  private readonly laserGeom: THREE.BufferGeometry;
  private readonly reticleGroup = new THREE.Group();

  private operativeRig: RiggedInstance | null = null;
  private wardenTelegraphRing: THREE.Mesh;
  private readonly enemyViz = new Map<string, EnemyViz>();
  private readonly lungeDecals: THREE.Mesh[] = [];
  private readonly muzzleGlows: THREE.Mesh[] = [];
  private readonly riggedEnemies = new Map<string, RiggedInstance>();
  private readonly staticEnemies = new Map<string, StaticActorHandle>();
  private readonly barrelHandles = new Map<string, StaticActorHandle>();
  private readonly pickupHandles = new Map<string, THREE.Group>();
  private readonly doorMeshes = new Map<string, { mesh: THREE.Mesh; baseY: number; height: number }>();
  private readonly upgradeMeshes = new Map<string, THREE.Object3D>();
  private readonly savePads: THREE.Mesh[] = [];
  private lastTick = -1;
  private airTime = 0;
  private prevPlayer: PosSnap = { x: 0, y: 0 };
  private curPlayer: PosSnap = { x: 0, y: 0 };
  private readonly lastEnemyStates = new Map<string, string>();
  private prevEnemies = new Map<string, PosSnap>();
  private curEnemies = new Map<string, PosSnap>();
  private readonly occludables: OccludableMesh[] = [];
  private decor: Decor3D | null = null;
  private fogDensity = 0.012;
  private readonly presetSky = new THREE.Color(0x8bb6df);
  private readonly presetSun = new THREE.Color(0xdcebff);
  private presetAmbI = 1.35;
  private presetSunI = 1.9;
  private readonly trimSpecs: { x: number; y: number; z: number; sx: number; sy: number; sz: number; color: number }[] = [];

  private coreModel: THREE.Group | null = null;
  private coreShield: THREE.Mesh | null = null;
  private exitModel: THREE.Group | null = null;
  private exitPortalRing: THREE.Mesh | null = null;
  private consoleRing: THREE.Mesh | null = null;
  private acidMeshes: THREE.Mesh[] = [];
  private builtLevelRef: WorldState3D['level'] | null = null;
  private lastWorldRef: WorldState3D | null = null;

  private readonly dynGroup = new THREE.Group();
  private readonly projMeshes = new Map<number, THREE.Mesh>();
  private readonly ringMeshes = new Map<number, THREE.Mesh>();
  private readonly explMeshes = new Map<number, THREE.Mesh>();
  private readonly beamMeshes = new Map<number, THREE.Mesh>();

  private readonly camFocus = new THREE.Vector3(3.5, 1.2, 0);
  private modelsReady = false;
  private lastRenderMs = performance.now();

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.info.autoReset = false;
    this.renderer.setSize(canvas.width, canvas.height, false);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.4;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x090e14);
    this.scene.fog = new THREE.FogExp2(0x090e14, 0.012);

    this.camera = new THREE.PerspectiveCamera(38, canvas.width / canvas.height, 0.4, 120);
    this.camera.position.set(3.5, 3.2, 15.5);

    this.ambient = new THREE.HemisphereLight(0x8bb6df, 0x242028, 1.35);
    this.scene.add(this.ambient);

    this.sun = new THREE.DirectionalLight(0xdcebff, 1.9);
    this.sun.position.set(6, 14, 16);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.camera.near = 2;
    this.sun.shadow.camera.far = 56;
    const d = 22;
    this.sun.shadow.camera.left = -d;
    this.sun.shadow.camera.right = d;
    this.sun.shadow.camera.top = d;
    this.sun.shadow.camera.bottom = -d;
    this.sun.shadow.bias = -0.0008;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    const rimLight = new THREE.DirectionalLight(0x2bf0ff, 0.85);
    rimLight.position.set(-10, 8, -10);
    this.scene.add(rimLight);

    this.alarmLight = new THREE.PointLight(0xff2936, 0, 42, 1.4);
    this.scene.add(this.alarmLight);

    // R3.3 Visual-only Headlamp + volumetric beam cone (keep visible=true & modulate intensity to avoid shader recompile)
    this.headlamp = new THREE.SpotLight(0xd9f7ff, 0, 24, 0.42, 0.5, 1.2);
    this.headlamp.visible = true;
    this.scene.add(this.headlamp);
    this.scene.add(this.headlampTarget);
    this.headlamp.target = this.headlampTarget;

    const coneGeom = new THREE.ConeGeometry(2.6, 10.5, 18, 1, true);
    coneGeom.translate(0, -5.25, 0);
    coneGeom.rotateX(-Math.PI / 2);
    this.headlampCone = new THREE.Mesh(
      coneGeom,
      new THREE.MeshBasicMaterial({
        color: 0x7ae8ff,
        transparent: true,
        opacity: 0.055,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    this.scene.add(this.headlampCone);

    // Visual-only fill light so the operative stays readable in dark shafts
    this.fillLight = new THREE.PointLight(0xbfe6ff, 22, 14, 1.3);
    this.scene.add(this.fillLight);

    this.muzzleLight = new THREE.PointLight(0x38f2ff, 0, 7, 1.6);
    this.scene.add(this.muzzleLight);

    // Laser sight + 3D ground reticle
    this.laserGeom = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(1, 0, 0)]);
    this.laserLine = new THREE.Line(
      this.laserGeom,
      new THREE.LineBasicMaterial({ color: 0x2bf0ff, transparent: true, opacity: 0.72 }),
    );
    this.scene.add(this.laserLine);

    const outerRet = new THREE.Mesh(
      new THREE.RingGeometry(0.32, 0.42, 24),
      new THREE.MeshBasicMaterial({ color: 0x2bf0ff, side: THREE.DoubleSide, transparent: true, opacity: 0.9 }),
    );
    const innerRet = new THREE.Mesh(
      new THREE.CircleGeometry(0.1, 16),
      new THREE.MeshBasicMaterial({ color: 0xff6b3d, side: THREE.DoubleSide }),
    );
    this.reticleGroup.add(outerRet, innerRet);
    this.scene.add(this.reticleGroup);

    this.wardenTelegraphRing = new THREE.Mesh(
      new THREE.RingGeometry(0.9, 1.35, 32),
      new THREE.MeshBasicMaterial({ color: 0xff3b2f, side: THREE.DoubleSide, transparent: true, opacity: 0.75 }),
    );
    this.wardenTelegraphRing.rotation.x = -Math.PI / 2;
    this.wardenTelegraphRing.visible = false;
    this.scene.add(this.wardenTelegraphRing);

    // Pooled telegraph meshes (emissive-free MeshBasicMaterial, no lights)
    const chevron = new THREE.Shape();
    chevron.moveTo(0, -0.22);
    chevron.lineTo(0.8, -0.22);
    chevron.lineTo(1, 0);
    chevron.lineTo(0.8, 0.22);
    chevron.lineTo(0, 0.22);
    chevron.lineTo(0.18, 0);
    chevron.closePath();
    const chevronGeo = new THREE.ShapeGeometry(chevron);
    const glowGeo = new THREE.SphereGeometry(1, 12, 8);
    for (let i = 0; i < TELEGRAPH_POOL_3D; i++) {
      const d = new THREE.Mesh(
        chevronGeo,
        new THREE.MeshBasicMaterial({ color: 0xff4a1f, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide }),
      );
      d.visible = false;
      this.scene.add(d);
      this.lungeDecals.push(d);
      const g = new THREE.Mesh(
        glowGeo,
        new THREE.MeshBasicMaterial({ color: 0xb06aff, transparent: true, opacity: 0.85, depthWrite: false }),
      );
      g.visible = false;
      this.scene.add(g);
      this.muzzleGlows.push(g);
    }

    this.scene.add(this.dynGroup);

    // Post-processing with selective bloom & tone-mapped output
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2)),
      0.36,
      0.3,
      0.9,
    );
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(new OutputPass());

    void preloadAllModels3D().then((res) => {
      this.modelsReady = res.loaded.length > 0;
      if (this.lastWorldRef) {
        this.rebuildActorInstances(this.lastWorldRef);
      } else if (this.builtLevelRef) {
        this.rebuildActorInstances({ level: this.builtLevelRef });
      }
    });
  }

  public isReady(): boolean {
    return this.modelsReady;
  }

  public getTelemetry() {
    const activeAnimations: Record<string, string> = {};
    if (this.operativeRig) activeAnimations.operative = this.operativeRig.currentAnim;
    for (const [id, rig] of this.riggedEnemies) {
      activeAnimations[id] = rig.currentAnim;
    }
    const enemyStates: Record<string, string> = {};
    for (const [id, st] of this.lastEnemyStates) enemyStates[id] = st;
    return {
      enemyStates,
      modelsLoaded: this.modelsReady,
      loadedModels: getLoadedModelNames3D(),
      failedModels: getFailedModelNames3D(),
      riggedCount: (this.operativeRig ? 1 : 0) + this.riggedEnemies.size,
      activeAnimations,
      drawCalls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
    };
  }

  /** Converts normalized canvas cursor coordinates (-1..1 NDC) into the world aim point on the z = 0 lane. */
  public screenToWorldAim(ndcX: number, ndcY: number, w: WorldState3D): { x: number; y: number; z: number } {
    this.camera.updateMatrixWorld();
    this.raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);
    const ray = this.raycaster.ray;
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    const hit = new THREE.Vector3();
    let hx = w.player.body.x + w.player.facing * 8;
    let hy = w.player.body.y + 1.1;
    if (ray.intersectPlane(plane, hit)) {
      hx = hit.x;
      hy = hit.y;
    }

    // Soft snap toward any alive enemy or the reactor core near the cursor
    let bestD = 0.9;
    for (const e of w.enemies) {
      if (!e.alive) continue;
      const cy = e.y + e.height * 0.55;
      const d = Math.hypot(e.x - hx, cy - hy) - e.radius;
      if (d < bestD) {
        bestD = d;
        hx = e.x;
        hy = cy;
      }
    }
    if (!w.coreDestroyed && bestD === 0.9) {
      const c = w.level.corePos;
      if (Math.hypot(c.x - hx, 1.35 - hy) < c.radius + 0.4) {
        hx = c.x;
        hy = 1.35;
      }
    }
    return { x: hx, y: hy, z: 0 };
  }

  private ensureWorldBuilt(w: WorldState3D): void {
    this.lastWorldRef = w;
    if (this.builtLevelRef === w.level) return;
    this.builtLevelRef = w.level;

    const tex = getFacilityTextures3D();

    // Build static geometry: floors, walls, catwalks, ramps, pillars, acid pools
    for (const s of w.level.solids) {
      this.addSolidMesh(s, tex);
    }
    this.buildTrim();
    this.decor?.dispose();
    this.decor = buildDecor3D(this.scene, w.level, tex);
    for (const r of w.level.ramps) {
      const mat = new THREE.MeshStandardMaterial({
        map: tex.grateMap,
        roughness: 0.42,
        metalness: 0.65,
      });
      const mesh = new THREE.Mesh(buildRampGeometry(r), mat);
      mesh.receiveShadow = true;
      mesh.castShadow = true;
      this.scene.add(mesh);

      // Side safety curb trim
      const edgeMat = new THREE.MeshStandardMaterial({
        color: 0x2bf0ff,
        emissive: 0x2bf0ff,
        emissiveIntensity: 0.55,
      });
      const marker = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.12), edgeMat);
      marker.position.set(
        r.axis === 'x' ? r.maxX : (r.minX + r.maxX) * 0.5,
        r.yMaxEdge + 0.06,
        r.axis === 'z' ? r.maxZ : (r.minZ + r.maxZ) * 0.5,
      );
      this.scene.add(marker);
    }

    for (const p of w.level.pillars) {
      const h = p.maxY - p.minY;
      const mat = new THREE.MeshStandardMaterial({
        map: tex.wallMap,
        roughness: 0.48,
        metalness: 0.6,
        transparent: true,
        opacity: 1,
      });
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(p.radius * 0.92, p.radius, h, 16), mat);
      mesh.position.set(p.x, p.minY + h * 0.5, p.z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
      this.occludables.push({ mesh, mat, center: mesh.position.clone() });

      // Glowing collar ring around blast pillar
      const ring = new THREE.Mesh(
        new THREE.CylinderGeometry(p.radius * 0.96, p.radius * 0.96, 0.14, 16),
        new THREE.MeshStandardMaterial({ color: 0xffaa33, emissive: 0xff9d2e, emissiveIntensity: 0.8 }),
      );
      ring.position.set(p.x, p.minY + 1.4, p.z);
      this.scene.add(ring);
    }

    for (const pool of w.level.acidPools) {
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(pool.maxX - pool.minX, pool.maxZ - pool.minZ),
        new THREE.MeshStandardMaterial({
          map: tex.acidMap,
          emissiveMap: tex.acidMap,
          emissive: 0x6dff3a,
          emissiveIntensity: 0.5,
          roughness: 0.15,
        }),
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set((pool.minX + pool.maxX) * 0.5, pool.surfaceY, (pool.minZ + pool.maxZ) * 0.5);
      this.scene.add(mesh);
      this.acidMeshes.push(mesh);

      const acidLight = new THREE.PointLight(0x6dff3a, 3, 9, 1.5);
      acidLight.position.set(mesh.position.x, pool.surfaceY + 1.1, 0.5);
      this.scene.add(acidLight);
    }

    // Security Console holographic beacon
    this.consoleRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.65, 0.05, 8, 24),
      new THREE.MeshStandardMaterial({ color: 0x2bf0ff, emissive: 0x2bf0ff, emissiveIntensity: 1.8 }),
    );
    this.consoleRing.position.set(w.level.consolePos.x, w.level.consolePos.y + 2.0, 1.0);
    this.scene.add(this.consoleRing);

    // Save / Recharge stations
    for (const st of w.level.saveStations) {
      const pad = new THREE.Mesh(
        new THREE.CylinderGeometry(0.9, 1.0, 0.16, 24),
        new THREE.MeshStandardMaterial({ color: 0x103a42, emissive: 0x2bf0ff, emissiveIntensity: 0.5, metalness: 0.6, roughness: 0.4 }),
      );
      pad.position.set(st.x, st.y + 0.08, 0.2);
      this.scene.add(pad);
      this.savePads.push(pad);
      const padBase = new THREE.Mesh(
        new THREE.CylinderGeometry(1.15, 1.2, 0.08, 24),
        new THREE.MeshStandardMaterial({ color: 0x151b22, metalness: 0.7, roughness: 0.6 }),
      );
      padBase.position.set(st.x, st.y + 0.04, 0.2);
      this.scene.add(padBase);
      const beam = new THREE.Mesh(
        new THREE.CylinderGeometry(0.75, 0.75, 2.4, 20, 1, true),
        new THREE.MeshBasicMaterial({ color: 0x2bf0ff, transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
      );
      beam.position.set(st.x, st.y + 1.3, 0.2);
      this.scene.add(beam);
    }

    // Upgrade pedestals: Thruster Boots (amber) and Energy Tanks (green)
    for (const up of w.level.upgrades) {
      const color = up.kind === 'thruster_boots' ? 0xffb02e : 0x3dff88;
      const gem = new THREE.Group();
      const core = new THREE.Mesh(
        up.kind === 'thruster_boots' ? new THREE.ConeGeometry(0.22, 0.46, 6) : new THREE.BoxGeometry(0.3, 0.46, 0.3),
        new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.65, roughness: 0.25, metalness: 0.1 }),
      );
      gem.add(core);
      const cage = new THREE.Mesh(
        up.kind === 'thruster_boots' ? new THREE.ConeGeometry(0.38, 0.78, 6) : new THREE.BoxGeometry(0.56, 0.78, 0.56),
        new THREE.MeshStandardMaterial({
          color: 0xbfd8e6,
          emissive: color,
          emissiveIntensity: 0.12,
          roughness: 0.1,
          metalness: 0.1,
          transparent: true,
          opacity: 0.28,
          depthWrite: false,
        }),
      );
      gem.add(cage);
      const cageWire = new THREE.Mesh(
        cage.geometry,
        new THREE.MeshBasicMaterial({ color: 0x5a6b78, wireframe: true, transparent: true, opacity: 0.7 }),
      );
      gem.add(cageWire);
      gem.position.set(up.x, up.y + 0.95, 0.2);
      this.scene.add(gem);
      this.upgradeMeshes.set(up.id, gem);
      const base = new THREE.Mesh(
        new THREE.CylinderGeometry(0.55, 0.65, 0.2, 18),
        new THREE.MeshStandardMaterial({ color: 0x1b232c, emissive: color, emissiveIntensity: 0.2, metalness: 0.7, roughness: 0.5 }),
      );
      base.position.set(up.x, up.y + 0.1, 0.2);
      this.scene.add(base);
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.5, 0.03, 6, 24),
        new THREE.MeshStandardMaterial({ color: 0x1b232c, emissive: color, emissiveIntensity: 0.6 }),
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.set(up.x, up.y + 0.22, 0.2);
      this.scene.add(ring);
    }

    this.rebuildActorInstances(w);
  }

  private addSolidMesh(s: MapSolid3D, tex: ReturnType<typeof getFacilityTextures3D>): void {
    const sx = s.maxX - s.minX;
    const visualMaxY = s.visualMaxY ?? s.maxY;
    const sy = Math.max(0.08, visualMaxY - s.minY);
    const sz = s.maxZ - s.minZ;
    const cx = (s.minX + s.maxX) * 0.5;
    const cy = s.minY + sy * 0.5;
    const cz = (s.minZ + s.maxZ) * 0.5;

    let mat: THREE.MeshStandardMaterial;
    if (s.kind === 'catwalk' && s.minY >= 0.5) {
      const map = tex.grateMap.clone();
      map.repeat.set(Math.max(1, sx / 2), Math.max(1, sz / 2));
      map.needsUpdate = true;
      mat = new THREE.MeshStandardMaterial({ map, color: 0x99b0c7, roughness: 0.42, metalness: 0.68 });
    } else if (s.kind === 'catwalk') {
      const map = tex.deckMap.clone();
      map.repeat.set(Math.max(1, sx / 4), Math.max(1, sz / 4));
      map.needsUpdate = true;
      const bump = tex.deckBump.clone();
      bump.repeat.copy(map.repeat);
      bump.needsUpdate = true;
      mat = new THREE.MeshStandardMaterial({ map, bumpMap: bump, bumpScale: 0.04, roughness: 0.55, metalness: 0.45 });
    } else if (s.kind === 'door') {
      const lockColor = s.doorLock ? DOOR_COLORS[s.doorLock] : 0xff4526;
      mat = new THREE.MeshStandardMaterial({
        map: s.doorLock === 'yellow' ? tex.wallMap : tex.hazardMap,
        color: s.doorLock === 'yellow' ? 0x6b5a2a : 0x23262e,
        emissive: lockColor,
        emissiveMap: s.doorLock === 'yellow' ? tex.wallMap : tex.hazardMap,
        emissiveIntensity: 0.6,
        roughness: 0.35,
        metalness: 0.72,
        transparent: true,
        opacity: 0.92,
      });
    } else if (s.kind === 'crate') {
      mat = new THREE.MeshStandardMaterial({
        map: tex.wallMap,
        color: s.color ?? 0x566474,
        roughness: 0.5,
        metalness: 0.55,
      });
    } else if (s.kind === 'console') {
      mat = new THREE.MeshStandardMaterial({
        color: 0x162b38,
        emissive: 0x1cb8d6,
        emissiveIntensity: 0.9,
        roughness: 0.3,
        metalness: 0.65,
      });
    } else {
      const map = tex.wallMap.clone();
      map.repeat.set(Math.max(1, Math.max(sx, sz) / 4), Math.max(1, sy / 3));
      map.needsUpdate = true;
      mat = new THREE.MeshStandardMaterial({
        map,
        color: s.color ?? 0x8d9dad,
        roughness: 0.52,
        metalness: 0.58,
        transparent: Boolean(!s.visualMaxY && s.maxY > 2.5 && s.minZ > 0),
        opacity: 1,
      });
    }

    // Break tiling: per-solid texture offset derived from the solid id.
    if (mat.map && mat.map.image && mat.map !== tex.hazardMap) {
      let hsh = 2166136261;
      for (let i = 0; i < s.id.length; i++) hsh = Math.imul(hsh ^ s.id.charCodeAt(i), 16777619);
      mat.map.offset.set(((hsh >>> 0) % 997) / 997, ((hsh >>> 8) % 991) / 991);
    }
    this.addSolidTrim(s, sx, sy, sz, cx, cy);

    const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
    mesh.position.set(cx, cy, cz);
    mesh.castShadow = s.kind !== 'catwalk' || s.minY >= 0.5;
    mesh.receiveShadow = true;
    this.scene.add(mesh);

    if (s.doorId) {
      this.doorMeshes.set(s.doorId, { mesh, baseY: cy, height: sy });
    } else if (s.kind === 'wall' && !s.visualMaxY && s.maxY > 2.5 && s.minZ > -2.5) {
      mat.transparent = true;
      this.occludables.push({ mesh, mat, center: mesh.position.clone() });
    }
  }

  /** Collects bevel lips, truss ribs, door frames and rivet rows as instanced trim boxes. */
  private addSolidTrim(s: MapSolid3D, sx: number, sy: number, sz: number, cx: number, cy: number): void {
    const top = s.minY + sy;
    const front = s.maxZ;
    const cap = 700;
    const push = (x: number, y: number, z: number, w: number, h: number, d: number, color: number): void => {
      if (this.trimSpecs.length < cap) this.trimSpecs.push({ x, y, z, sx: w, sy: h, sz: d, color });
    };
    if (s.kind === 'catwalk' || s.kind === 'platform') {
      push(cx, top + 0.02, front - 0.12, sx, 0.04, 0.24, 0x7a8a9c);
      if (s.minY >= 0.5) {
        for (let x = s.minX + 0.5; x < s.maxX - 0.2; x += 2) push(x, s.minY - 0.17, (s.minZ + s.maxZ) * 0.5, 0.12, 0.34, sz * 0.9, 0x2c343e);
      }
    } else if (s.kind === 'door') {
      push(s.minX - 0.1, cy, front + 0.05, 0.22, sy + 0.2, 0.14, 0x3a4350);
      push(s.maxX + 0.1, cy, front + 0.05, 0.22, sy + 0.2, 0.14, 0x3a4350);
      push(cx, top + 0.1, front + 0.05, sx + 0.44, 0.2, 0.14, 0x8a6a1a);
    } else if (s.kind === 'wall' && sx >= 4 && sy >= 3) {
      for (let x = s.minX + 1; x < s.maxX - 0.5; x += 2) push(x, cy, front + 0.02, 0.1, 0.1, 0.06, 0x56626f);
    }
  }

  private buildTrim(): void {
    const n = this.trimSpecs.length;
    if (n === 0) return;
    const im = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55, metalness: 0.6 }),
      n,
    );
    const d = new THREE.Object3D();
    const c = new THREE.Color();
    this.trimSpecs.forEach((t, i) => {
      d.position.set(t.x, t.y, t.z);
      d.scale.set(t.sx, t.sy, t.sz);
      d.updateMatrix();
      im.setMatrixAt(i, d.matrix);
      im.setColorAt(i, c.setHex(t.color));
    });
    im.receiveShadow = true;
    this.scene.add(im);
    this.trimSpecs.length = 0;
  }

  private rebuildActorInstances(w: WorldState3D | { level: WorldState3D['level']; enemies?: WorldState3D['enemies']; barrels?: WorldState3D['barrels']; pickups?: WorldState3D['pickups'] }): void {
    // Clear existing model nodes cleanly on model load finish
    if (this.operativeRig) {
      this.scene.remove(this.operativeRig.root);
      this.operativeRig = null;
    }
    for (const r of this.riggedEnemies.values()) this.scene.remove(r.root);
    this.riggedEnemies.clear();
    for (const st of this.staticEnemies.values()) this.scene.remove(st.root);
    this.staticEnemies.clear();
    this.enemyViz.clear();
    for (const b of this.barrelHandles.values()) this.scene.remove(b.root);
    this.barrelHandles.clear();
    if (this.coreModel) {
      this.scene.remove(this.coreModel);
      this.coreModel = null;
    }
    if (this.coreShield) {
      this.scene.remove(this.coreShield);
      this.coreShield = null;
    }
    if (this.exitModel) {
      this.scene.remove(this.exitModel);
      this.exitModel = null;
    }
    if (this.exitPortalRing) {
      this.scene.remove(this.exitPortalRing);
      this.exitPortalRing = null;
    }
    for (const pk of this.pickupHandles.values()) this.scene.remove(pk);
    this.pickupHandles.clear();

    // Operative with attached Pulse Rifle on RightHand
    this.operativeRig = instantiateRiggedModel3D('operative', 1.82, true);
    this.scene.add(this.operativeRig.root);

    // Enemies
    const enemySpecs = 'enemies' in w && w.enemies ? w.enemies : w.level.enemies;
    for (const e of enemySpecs) {
      if (e.kind === 'warden' || e.kind === 'stalker') {
        const rig = instantiateRiggedModel3D(
          e.kind === 'warden' ? 'warden' : 'bio-stalker',
          e.kind === 'warden' ? 3.15 : 1.78,
          false,
        );
        rig.root.position.set(e.x, e.y, e.z);
        rig.root.rotation.order = 'YXZ';
        tuneEnemyMaterials3D(rig.materials, rig.baseEmissive, ENEMY_TINT_3D[e.kind]);
        this.scene.add(rig.root);
        this.riggedEnemies.set(e.id, rig);
      } else {
        const key = e.kind === 'spitter' ? 'spitter' : 'crawler';
        const h = e.kind === 'spitter' ? 1.5 : 0.85;
        const st = instantiateStaticModel3D(key, h, true);
        st.root.position.set(e.x, e.y, e.z);
        st.root.rotation.order = 'YXZ';
        tuneEnemyMaterials3D(st.materials, st.baseEmissive, ENEMY_TINT_3D[e.kind]);
        this.scene.add(st.root);
        this.staticEnemies.set(e.id, { ...st, baseScale: h });
      }
    }

    // Explosive Bio-Barrels
    const barrels = 'barrels' in w && w.barrels ? w.barrels : w.level.barrels;
    for (const b of barrels) {
      const br = instantiateStaticModel3D('bio-barrel', 1.28, true);
      br.root.position.set(b.x, b.y, b.z);
      this.scene.add(br.root);
      this.barrelHandles.set(b.id, { ...br, baseScale: 1.28 });
    }

    // Power Core & Forcefield Shield
    const core = instantiateStaticModel3D('power-core', 3.1, true);
    core.root.position.set(w.level.corePos.x, w.level.corePos.y, w.level.corePos.z);
    this.coreModel = core.root;
    this.scene.add(this.coreModel);

    this.coreShield = new THREE.Mesh(
      new THREE.IcosahedronGeometry(2.15, 1),
      new THREE.MeshBasicMaterial({
        color: 0x2bf0ff,
        wireframe: true,
        transparent: true,
        opacity: 0.45,
      }),
    );
    this.coreShield.position.set(w.level.corePos.x, 1.55, 0);
    this.scene.add(this.coreShield);

    // Exit Gate & Portal Ring
    const exit = instantiateStaticModel3D('exit-gate', 4.2, true);
    exit.root.position.set(w.level.exitPos.x, w.level.exitPos.y, -0.8);
    this.exitModel = exit.root;
    this.scene.add(this.exitModel);

    this.exitPortalRing = new THREE.Mesh(
      new THREE.TorusGeometry(1.5, 0.08, 10, 32),
      new THREE.MeshStandardMaterial({ color: 0x3dff9e, emissive: 0x3dff9e, emissiveIntensity: 1.3 }),
    );
    this.exitPortalRing.position.set(w.level.exitPos.x, w.level.exitPos.y + 2.05, 0.3);
    this.scene.add(this.exitPortalRing);
  }

  private getOrCreatePickupGroup(id: string, kind: 'med' | 'ammo' | 'weapon', weapon?: WeaponSlot3D): THREE.Group {
    const existing = this.pickupHandles.get(id);
    if (existing) return existing;
    const grp = new THREE.Group();
    const color =
      kind === 'med' ? 0x3dff88 : kind === 'ammo' ? 0xf5b942 : weapon === 4 ? 0xd946ef : weapon === 3 ? 0xff7b2f : 0x2bf0ff;

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.45, 0.6, 20),
      new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.75 }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.05;
    grp.add(ring);

    if (kind === 'weapon') {
      const gun = instantiateStaticModel3D('pulse-rifle', 0.9, false);
      for (const m of gun.materials) {
        m.emissive.setHex(color);
        m.emissiveIntensity = 0.9;
      }
      gun.root.position.y = 0.95;
      grp.add(gun.root);
    } else {
      const core = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.32, 0),
        new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.5, roughness: 0.2 }),
      );
      core.position.y = 0.65;
      grp.add(core);
    }

    this.scene.add(grp);
    this.pickupHandles.set(id, grp);
    return grp;
  }

  /** Snapshot positions once per simulation tick so render() can interpolate at the display rate. */
  private captureTick(w: WorldState3D): void {
    if (w.tick === this.lastTick) return;
    const teleport = Math.abs(w.player.body.x - this.curPlayer.x) > 6 || Math.abs(w.player.body.y - this.curPlayer.y) > 6;
    this.prevPlayer = teleport || this.lastTick < 0 ? { x: w.player.body.x, y: w.player.body.y } : this.curPlayer;
    this.curPlayer = { x: w.player.body.x, y: w.player.body.y };
    this.prevEnemies = this.curEnemies;
    this.curEnemies = new Map(w.enemies.map((e) => [e.id, { x: e.x, y: e.y }]));
    this.lastTick = w.tick;
  }

  /** alpha in [0,1]: fraction of the next 60 Hz tick elapsed since the last simulated tick. */
  public render(w: WorldState3D, alpha = 1): void {
    const now = performance.now();
    const dt = Math.min(0.05, Math.max(0.001, (now - this.lastRenderMs) / 1000));
    this.lastRenderMs = now;
    const tSec = now * 0.001;
    const a = Math.max(0, Math.min(1, alpha));

    this.ensureWorldBuilt(w);
    this.captureTick(w);

    // 1. Locks: colored energy shields slide away once opened
    for (const [id, entry] of this.doorMeshes) {
      const open = w.openDoors.has(id);
      const targetY = open ? entry.baseY + entry.height + 0.3 : entry.baseY;
      entry.mesh.position.y += (targetY - entry.mesh.position.y) * Math.min(1, dt * 8);
      const mat = entry.mesh.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = open ? 0.15 : 0.5 + Math.sin(tSec * 3 + entry.baseY) * 0.15;
      entry.mesh.visible = !open || Math.abs(entry.mesh.position.y - targetY) > 0.05;
    }

    // 2. Acid UV scroll, Console and Save pulses, upgrades
    for (const am of this.acidMeshes) {
      const mat = am.material as THREE.MeshStandardMaterial;
      if (mat.emissiveMap) {
        mat.emissiveMap.offset.x = (tSec * 0.08) % 1;
        mat.emissiveMap.offset.y = Math.sin(tSec * 1.4) * 0.06;
      }
    }
    if (this.consoleRing) {
      const mat = this.consoleRing.material as THREE.MeshStandardMaterial;
      mat.color.setHex(w.consoleUnlocked ? 0x3dff9e : 0x2bf0ff);
      mat.emissive.setHex(w.consoleUnlocked ? 0x3dff9e : 0x2bf0ff);
      this.consoleRing.rotation.y = tSec * 1.6;
    }
    for (const pad of this.savePads) {
      (pad.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.45 + Math.sin(tSec * 2.4) * 0.15;
    }
    for (const [id, gem] of this.upgradeMeshes) {
      gem.visible = !w.collectedUpgrades.has(id);
      gem.rotation.y = tSec * 2.0;
      gem.position.y = (w.level.upgrades.find((u) => u.id === id)?.y ?? 0) + 0.95 + Math.sin(tSec * 3 + gem.position.x) * 0.12;
    }

    // 3. Sector ambience and Meltdown lighting
    const room = w.level.rooms.find((r) => r.sector === w.currentRoom);
    const inMeltdown = w.coreDestroyed && w.meltdownTicks >= 0;
    const bg = new THREE.Color(room ? room.ambientColor : 0x090e14).multiplyScalar(0.28);
    (this.scene.background as THREE.Color).lerp(bg, Math.min(1, dt * 3));
    (this.scene.fog as THREE.FogExp2).color.copy(this.scene.background as THREE.Color);
    const fogTarget = Math.min(0.02, room ? SECTOR_FOG[room.sector] : 0.012);
    this.fogDensity += (fogTarget - this.fogDensity) * Math.min(1, dt * 2);
    (this.scene.fog as THREE.FogExp2).density = this.fogDensity;
    this.decor?.update(tSec, w.player.body.x, w.player.body.y);
    const preset = SECTOR_LIGHT[room ? room.sector : 'airlock'];
    const lk = Math.min(1, dt * 2.5);
    this.presetSky.lerp(preset.sky, lk);
    this.presetSun.lerp(preset.sun, lk);
    this.presetAmbI += (preset.ambient - this.presetAmbI) * lk;
    this.presetSunI += (preset.sunI - this.presetSunI) * lk;
    this.bloomPass.strength += (preset.bloom - this.bloomPass.strength) * lk;
    this.ambient.intensity = this.presetAmbI;
    this.sun.intensity = this.presetSunI;
    this.sun.color.copy(this.presetSun);
    if (inMeltdown) {
      const pulse = 0.5 + 0.5 * Math.sin(tSec * 8.5);
      this.alarmLight.intensity = 14 + pulse * 18;
      this.alarmLight.position.set(w.player.body.x, w.player.body.y + 4.2, 3);
      this.ambient.color.setHex(0xc96b6b);
    } else {
      this.alarmLight.intensity = 0;
      this.ambient.color.copy(this.presetSky);
    }

    // 4. Operative: side-view root facing, velocity-locked pose, two-handed rifle IK, laser sight, R3.3 headlamp
    const p = w.player;
    const pb = p.body;
    const px = this.prevPlayer.x + (this.curPlayer.x - this.prevPlayer.x) * a;
    const py = this.prevPlayer.y + (this.curPlayer.y - this.prevPlayer.y) * a;
    const pose = getPlayerPose3D(w);
    if (this.operativeRig) {
      const rig = this.operativeRig;
      rig.root.position.set(px, py, 0);
      // Smooth turn-around instead of a hard 180 degree snap
      const faceYaw = pose.aimSignX > 0 ? Math.PI * 0.5 : -Math.PI * 0.5;
      rig.root.rotation.y = w.tick <= 2 ? faceYaw : turnToward(rig.root.rotation.y, faceYaw, dt, 18);
      // Debounce airborne pose so stepping off a ledge or a one-tick floor miss does not trigger the jump clip
      this.airTime = pb.grounded ? 0 : this.airTime + dt;
      const airborne = !pb.grounded && (pb.vy > 0.5 || this.airTime > 0.1);

      const desiredAnim: ActorAnimAction =
        p.hp <= 0
          ? 'death'
          : airborne
            ? 'jump'
            : pb.dashTicks > 0 || Math.abs(pb.vx) > 1.2
              ? 'run'
              : 'idle';

      stepRiggedAnimation3D(rig, desiredAnim, dt, 1.08, 0, p.hp > 0, { ...pose, grounded: pose.grounded || !airborne });
      rig.root.updateMatrixWorld(true);

      if (p.hurtFlashTicks > 0) flashRiggedMaterials3D(rig, 0xff2f2f, 0.75);
      else if (p.dashInvulnTicks > 0) flashRiggedMaterials3D(rig, 0x2bf0ff, 0.55);
      else flashRiggedMaterials3D(rig, 0x000000, 0);

      const muzzlePos = new THREE.Vector3();
      if (rig.muzzleLocal) rig.muzzleLocal.getWorldPosition(muzzlePos);
      else muzzlePos.set(px + pose.aimDirX * 0.85, py + 1.15 + pose.aimDirY * 0.85, 0.2);

      const posAttr = this.laserGeom.attributes.position as THREE.BufferAttribute;
      posAttr.setXYZ(0, muzzlePos.x, muzzlePos.y, muzzlePos.z);
      posAttr.setXYZ(1, p.aimX, p.aimY, 0.2);
      posAttr.needsUpdate = true;

      this.reticleGroup.position.set(p.aimX, p.aimY, 0.3);
      this.reticleGroup.rotation.z = tSec * 3.2;

      this.fillLight.position.set(px, py + 1.8, 4.2);
      this.muzzleLight.intensity = p.muzzleFlashTicks > 0 ? 14 : 0;
      this.muzzleLight.position.copy(muzzlePos);

      // R3.3 Headlamp (100% visual-only)
      this.headlamp.intensity = w.light.on ? 34 : 0;
      this.headlampCone.visible = w.light.on;
      if (w.light.on) {
        const hx = px + pose.aimDirX * 0.35;
        const hy = py + 1.55;
        this.headlamp.position.set(hx, hy, 0.6);
        this.headlampTarget.position.set(hx + pose.aimDirX * 10, hy + pose.aimDirY * 10, 0);
        this.headlampCone.position.set(hx, hy, 0.6);
        this.headlampCone.lookAt(this.headlampTarget.position);
      }
    }

    // 5. Enemies (rigged and static meshes), interpolated
    let telegraphWarden: WorldState3D['enemies'][number] | null = null;
    let decalIdx = 0;
    let glowIdx = 0;
    for (const e of w.enemies) {
      const pe = this.prevEnemies.get(e.id) ?? { x: e.x, y: e.y };
      const ce = this.curEnemies.get(e.id) ?? { x: e.x, y: e.y };
      const ex = Math.abs(ce.x - pe.x) > 4 ? ce.x : pe.x + (ce.x - pe.x) * a;
      const ey = Math.abs(ce.y - pe.y) > 4 ? ce.y : pe.y + (ce.y - pe.y) * a;
      this.lastEnemyStates.set(e.id, e.alive ? e.state : 'dead');

      let v = this.enemyViz.get(e.id);
      if (!v) {
        v = { yaw: e.yaw, lean: 0, recoil: 0, prevHit: 0, shot: 0, prevWindup: 0, phase: (e.x * 1.7) % 6.28 };
        this.enemyViz.set(e.id, v);
      }
      // Smooth turn (rate ~7) with a lean into the turn
      const yawDiff = wrapAngle(e.yaw - v.yaw);
      v.yaw = turnToward(v.yaw, e.yaw, dt, 7);
      const leanTarget = Math.max(-0.12, Math.min(0.12, yawDiff * 0.1));
      v.lean += (leanTarget - v.lean) * Math.min(1, dt * 10);
      if (e.hitFlashTicks > v.prevHit) v.recoil = 1;
      v.prevHit = e.hitFlashTicks;
      v.recoil = Math.max(0, v.recoil - dt * 6);
      if (v.prevWindup > 0 && e.windupTicks === 0 && e.alive) v.shot = 1;
      v.prevWindup = e.windupTicks;
      v.shot = Math.max(0, v.shot - dt * 5);

      const speed = Math.abs(e.vx);
      const windTotal = e.kind === 'warden' && e.phase === 2 ? 28 : ENEMY_WINDUP_TOTAL_3D[e.kind];
      const winding = e.alive && (e.windupTicks > 0 || e.state === 'windup');
      const alerting = e.alive && e.state === 'alert';
      const striking = e.alive && !winding && (e.state === 'attack' || e.attackAnimTicks > 0);
      const windFrac = winding ? 1 - e.windupTicks / windTotal : 0;
      const flashAmt = e.hitFlashTicks > 0 ? Math.min(1, e.hitFlashTicks / 4) * 0.35 : 0;

      const rig = this.riggedEnemies.get(e.id);
      if (rig) {
        rig.root.position.set(ex, ey, 0);
        rig.root.rotation.set(-v.recoil * 0.12, v.yaw, v.lean);
        rig.root.scale.setScalar(1 + v.recoil * 0.05);
        let desired: 'idle' | 'walk' | 'run' | 'attack' | 'death' = 'idle';
        let mode: 'hold' | 'play' = 'play';
        let frac = 0;
        if (!e.alive) desired = 'death';
        else if (winding) {
          desired = 'attack';
          mode = 'hold';
          frac = windFrac;
        } else if (alerting) {
          desired = 'attack';
          mode = 'hold';
          frac = 1 - e.stateTicks / 20;
        } else if (striking) desired = 'attack';
        else if (e.state !== 'stagger' && speed > 0.4) desired = e.kind !== 'warden' && speed > 4.2 ? 'run' : 'walk';
        stepRiggedEnemyAnimation3D(
          rig,
          { desired, speed, refSpeed: desired === 'run' ? 5.5 : e.kind === 'warden' ? 2.6 : 2.2, attackMode: mode, attackFrac: frac },
          dt,
        );
        if (flashAmt > 0) {
          flashRiggedMaterials3D(rig, ENEMY_FLASH_HEX_3D, flashAmt);
        } else if (e.kind === 'warden' && winding) {
          flashRiggedMaterials3D(rig, 0xff451f, 0.22);
        } else if (e.kind === 'warden' && e.phase === 2 && e.alive) {
          flashRiggedMaterials3D(rig, 0xff3b18, 0.09);
        } else {
          flashRiggedMaterials3D(rig, 0x000000, 0);
        }
        if (e.kind === 'warden' && e.alive && e.windupTicks > 0) telegraphWarden = e;
      }

      const st = this.staticEnemies.get(e.id);
      if (st) {
        const r = st.root;
        let sx = 1;
        let sy = 1;
        let sz = 1;
        let pitch = 0;
        let roll = v.lean;
        let lift = 0;
        if (!e.alive) {
          const deathT = Math.min(1, e.deathTicks / 24);
          roll = (Math.PI * 0.48) * (1 - Math.pow(1 - deathT, 3));
          sy = 1 - 0.1 * deathT;
          r.visible = e.deathTicks < 240;
        } else if (e.kind === 'crawler') {
          const run = Math.min(1, speed / 6);
          lift = Math.abs(Math.sin(tSec * 22 + v.phase)) * 0.05 * run;
          pitch = 0.18 * run;
          roll += Math.sin(tSec * 11 + v.phase) * 0.04 * run;
          if (winding) {
            sy = 1 - 0.28 * windFrac;
            sx = 1 + 0.15 * windFrac;
            sz = sx;
            pitch = 0.25 * windFrac;
          } else if (striking) {
            sz = 1.3;
            sy = 0.88;
            sx = 0.92;
            pitch = 0.3;
          }
        } else {
          lift = 0.05 + Math.sin(tSec * 2.2 + v.phase) * 0.12;
          roll += Math.sin(tSec * 1.7 + v.phase) * 0.05;
          if (winding) {
            const k = 1 + 0.22 * windFrac;
            sx = k;
            sz = k;
            sy = 1 + 0.12 * windFrac;
            pitch = -0.15 * windFrac;
          }
          sz *= 1 - 0.15 * v.shot;
          pitch += 0.2 * v.shot;
        }
        const pulse = 1 + v.recoil * 0.06;
        r.position.set(ex, ey + lift, 0);
        r.rotation.set(pitch - v.recoil * 0.18, v.yaw, roll);
        r.scale.set(sx * pulse, sy * pulse, sz * pulse);
        flashMaterials3D(st.materials, st.baseEmissive, ENEMY_FLASH_HEX_3D, flashAmt);
        if (e.alive && e.kind === 'spitter' && winding && glowIdx < this.muzzleGlows.length) {
          const g = this.muzzleGlows[glowIdx++];
          g.visible = true;
          g.position.set(ex + e.facing * 0.6, ey + 1.0 + lift, 0.25);
          g.scale.setScalar(0.08 + windFrac * 0.3);
        }
      }

      if (e.alive && winding && (e.kind === 'crawler' || e.kind === 'stalker') && decalIdx < this.lungeDecals.length) {
        const d = this.lungeDecals[decalIdx++];
        const len = e.kind === 'crawler' ? 2.6 : 3.6;
        d.visible = true;
        d.position.set(ex, ey + 0.2, 0.35);
        d.scale.set(e.facing * len, 0.6, 1);
        (d.material as THREE.MeshBasicMaterial).opacity = 0.25 + 0.5 * windFrac;
      }
    }
    for (let i = decalIdx; i < this.lungeDecals.length; i++) this.lungeDecals[i].visible = false;
    for (let i = glowIdx; i < this.muzzleGlows.length; i++) this.muzzleGlows[i].visible = false;

    if (telegraphWarden) {
      this.wardenTelegraphRing.visible = true;
      const pct = 1 - telegraphWarden.windupTicks / (telegraphWarden.phase === 2 ? 28 : 36);
      this.wardenTelegraphRing.position.set(telegraphWarden.x, telegraphWarden.y + 0.1, 0);
      this.wardenTelegraphRing.scale.setScalar(1.2 + pct * 2.2);
    } else {
      this.wardenTelegraphRing.visible = false;
    }

    // 6. Bio-Barrels, Power Core, Exit Gate & Pickups
    for (const b of w.barrels) {
      const h = this.barrelHandles.get(b.id);
      if (!h) continue;
      h.root.visible = b.alive;
      if (b.alive) {
        h.root.position.set(b.x, b.y, 0);
        const flash = b.fuseTicks >= 0 ? 0.85 : b.hitFlashTicks > 0 ? 0.65 : 0;
        for (let i = 0; i < h.materials.length; i++) {
          h.materials[i].emissive.copy(h.baseEmissive[i]).lerp(new THREE.Color(0xff7722), flash);
        }
      }
    }

    if (this.coreModel) {
      this.coreModel.visible = !w.coreDestroyed;
      this.coreModel.rotation.y = tSec * 0.45;
    }
    if (this.coreShield) {
      const wardenAlive = w.enemies.some((e) => e.kind === 'warden' && e.alive);
      this.coreShield.visible = !w.coreDestroyed && wardenAlive;
      this.coreShield.rotation.y = -tSec * 0.9;
    }
    if (this.exitPortalRing) {
      const mat = this.exitPortalRing.material as THREE.MeshStandardMaterial;
      mat.color.setHex(w.coreDestroyed ? 0x3dff9e : 0xff6b3d);
      mat.emissive.setHex(w.coreDestroyed ? 0x3dff9e : 0xff6b3d);
      this.exitPortalRing.rotation.z = tSec * (w.coreDestroyed ? 2.4 : 0.4);
    }

    for (const pk of w.pickups) {
      if (pk.taken) {
        const g = this.pickupHandles.get(pk.id);
        if (g) g.visible = false;
        continue;
      }
      const g = this.getOrCreatePickupGroup(pk.id, pk.kind, pk.weapon);
      g.visible = true;
      g.position.set(pk.x, pk.y, 0.2);
      if (g.children[1]) {
        g.children[1].rotation.y = tSec * 2.1;
        g.children[1].position.y = (pk.kind === 'weapon' ? 0.95 : 0.65) + Math.sin(tSec * 3.4) * 0.12;
      }
    }

    // 7. Dynamic Projectiles, Shockwaves, Explosions & Rail Beams
    this.syncDynamicFX(w, dt);

    // 8. Side-view camera: look-ahead toward the aim, soft follow, per-room vertical clamp, shake
    const lookAhead = Math.max(-2.2, Math.min(2.2, (p.aimX - px) * 0.14));
    const targetFocus = new THREE.Vector3(px + lookAhead, py + 1.45, 0);
    if (room) {
      const halfH = 5.2;
      targetFocus.y = Math.max(room.minY + halfH * 0.55, Math.min(Math.max(room.minY + halfH * 0.55, room.maxY - halfH * 0.45), targetFocus.y));
    }
    if (this.camFocus.distanceTo(targetFocus) > 9) this.camFocus.copy(targetFocus);
    else this.camFocus.lerp(targetFocus, Math.min(1, dt * 7));

    const sx = w.shakeTicks > 0 ? Math.sin(w.tick * 2.1) * w.shakeStrength : 0;
    const sy = w.shakeTicks > 0 ? Math.cos(w.tick * 2.7) * w.shakeStrength : 0;
    this.camera.position.set(this.camFocus.x + sx, this.camFocus.y + 1.7 + sy, 15.5);
    this.camera.lookAt(this.camFocus.x, this.camFocus.y, 0);

    this.sun.position.set(px + 6, py + 14, 16);
    this.sun.target.position.set(px, py, 0);
    this.sun.target.updateMatrixWorld();

    // 9. Fade tall foreground walls between camera and player (decor only)
    const camDist = this.camera.position.distanceTo(this.camFocus);
    for (const occ of this.occludables) {
      const toObjDist = occ.center.distanceTo(this.camera.position);
      const nearCam = toObjDist < camDist - 1.2 && Math.abs(occ.center.x - px) < 6.5 && occ.center.z > 1.5;
      const wantOpacity = nearCam ? 0.24 : 1.0;
      occ.mat.opacity += (wantOpacity - occ.mat.opacity) * Math.min(1, dt * 10);
      occ.mat.depthWrite = occ.mat.opacity > 0.8;
    }

    this.renderer.info.reset();
    this.composer.render();
  }

  private syncDynamicFX(w: WorldState3D, _dt: number): void {
    // Projectiles
    const liveProj = new Set<number>();
    for (const pr of w.projectiles) {
      liveProj.add(pr.id);
      let mesh = this.projMeshes.get(pr.id);
      if (!mesh) {
        const col =
          pr.kind === 'grenade'
            ? 0xff8c2e
            : pr.kind === 'scatter'
              ? 0xffd24c
              : pr.kind === 'enemy_acid'
                ? 0x73ff3d
                : pr.kind === 'boss_plasma'
                  ? 0xff3b2f
                  : 0x2bf0ff;
        const r = pr.kind === 'grenade' ? 0.24 : pr.radius;
        mesh = new THREE.Mesh(
          new THREE.SphereGeometry(r, 10, 8),
          new THREE.MeshBasicMaterial({ color: col }),
        );
        this.dynGroup.add(mesh);
        this.projMeshes.set(pr.id, mesh);
      }
      mesh.position.set(pr.x, pr.y, 0.2);
    }
    for (const [id, m] of this.projMeshes) {
      if (!liveProj.has(id)) {
        this.dynGroup.remove(m);
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
        this.projMeshes.delete(id);
      }
    }

    // Boss shockwaves: twin floor waves travelling east and west (jump over them)
    const liveSw = new Set<number>();
    for (const sw of w.shockwaves) {
      liveSw.add(sw.id);
      let grp = this.ringMeshes.get(sw.id) as unknown as THREE.Group | undefined;
      if (!grp) {
        grp = new THREE.Group();
        for (let k = 0; k < 2; k++) {
          grp.add(
            new THREE.Mesh(
              new THREE.BoxGeometry(0.5, 0.75, 4.6),
              new THREE.MeshBasicMaterial({
                color: sw.phase === 2 ? 0xff2944 : 0xff7b26,
                transparent: true,
                opacity: 0.85,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
              }),
            ),
          );
        }
        this.dynGroup.add(grp);
        this.ringMeshes.set(sw.id, grp as unknown as THREE.Mesh);
      }
      grp.children[0].position.set(sw.x + sw.radius, sw.y + 0.38, 0);
      grp.children[1].position.set(sw.x - sw.radius, sw.y + 0.38, 0);
    }
    for (const [id, m] of this.ringMeshes) {
      if (!liveSw.has(id)) {
        this.dynGroup.remove(m);
        const grp = m as unknown as THREE.Group;
        for (const c of grp.children) {
          const cm = c as THREE.Mesh;
          cm.geometry.dispose();
          (cm.material as THREE.Material).dispose();
        }
        this.ringMeshes.delete(id);
      }
    }

    // Explosions
    const liveEx = new Set<number>();
    for (const ex of w.explosions) {
      liveEx.add(ex.id);
      let mesh = this.explMeshes.get(ex.id);
      if (!mesh) {
        mesh = new THREE.Mesh(
          new THREE.IcosahedronGeometry(1, 1),
          new THREE.MeshBasicMaterial({
            color: ex.color,
            wireframe: true,
            transparent: true,
            opacity: 0.78,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          }),
        );
        const core = new THREE.Mesh(
          new THREE.SphereGeometry(0.55, 14, 12),
          new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.75,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          }),
        );
        mesh.add(core);
        this.dynGroup.add(mesh);
        this.explMeshes.set(ex.id, mesh);
      }
      const p = 1 - ex.ticksLeft / ex.maxTicks;
      mesh.position.set(ex.x, ex.y, 0.2);
      mesh.rotation.y = p * 2.4;
      mesh.scale.setScalar(0.35 + p * ex.maxRadius * 0.72);
      const fade = Math.max(0.05, 0.85 * (1 - p));
      (mesh.material as THREE.MeshBasicMaterial).opacity = fade;
      if (mesh.children[0]) {
        ((mesh.children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = fade * 0.85;
      }
    }
    for (const [id, m] of this.explMeshes) {
      if (!liveEx.has(id)) {
        this.dynGroup.remove(m);
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
        this.explMeshes.delete(id);
      }
    }

    // Rail-Cannon Beams
    const liveBm = new Set<number>();
    for (const bm of w.beams) {
      liveBm.add(bm.id);
      let mesh = this.beamMeshes.get(bm.id);
      const a = new THREE.Vector3(bm.x1, bm.y1, 0.2);
      const b = new THREE.Vector3(bm.x2, bm.y2, 0.2);
      if (!mesh) {
        const len = Math.max(0.1, a.distanceTo(b));
        mesh = new THREE.Mesh(
          new THREE.CylinderGeometry(0.11, 0.11, len, 8),
          new THREE.MeshBasicMaterial({
            color: 0xe879f9,
            transparent: true,
            opacity: 0.95,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          }),
        );
        mesh.position.copy(a).lerp(b, 0.5);
        mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
        this.dynGroup.add(mesh);
        this.beamMeshes.set(bm.id, mesh);
      }
      (mesh.material as THREE.MeshBasicMaterial).opacity = bm.ticksLeft / bm.maxTicks;
    }
    for (const [id, m] of this.beamMeshes) {
      if (!liveBm.has(id)) {
        this.dynGroup.remove(m);
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
        this.beamMeshes.delete(id);
      }
    }
  }
}
