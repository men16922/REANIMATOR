// Full 3D Quarter-View Three.js WebGL2 Renderer for REANIMATOR.
// Drives rigged SkinnedMesh animations via AnimationMixer, RightHand Pulse Rifle socket,
// 360 cursor raycasting, selective UnrealBloomPass, PCFSoftShadowMap, and R3.3 visual-only headlamp.

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import type { MapSolid3D, Ramp3D, WeaponSlot3D } from '../game3d/map3d.ts';
import type { ActorAnimAction, WorldState3D } from '../game3d/world3d.ts';
import {
  flashRiggedMaterials3D,
  getFailedModelNames3D,
  getLoadedModelNames3D,
  instantiateRiggedModel3D,
  instantiateStaticModel3D,
  preloadAllModels3D,
  stepRiggedAnimation3D,
  type RiggedInstance,
} from './riggedModels.ts';
import { getFacilityTextures3D } from './textures3d.ts';

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

function wrapAngleDiff(target: number, current: number): number {
  let d = target - current;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

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
  private readonly laserLine: THREE.Line;
  private readonly laserGeom: THREE.BufferGeometry;
  private readonly reticleGroup = new THREE.Group();

  private operativeRig: RiggedInstance | null = null;
  private wardenTelegraphRing: THREE.Mesh;
  private readonly riggedEnemies = new Map<string, RiggedInstance>();
  private readonly staticEnemies = new Map<string, StaticActorHandle>();
  private readonly barrelHandles = new Map<string, StaticActorHandle>();
  private readonly pickupHandles = new Map<string, THREE.Group>();
  private readonly doorMeshes = new Map<string, { mesh: THREE.Mesh; baseY: number }>();
  private readonly occludables: OccludableMesh[] = [];

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

  private readonly camFocus = new THREE.Vector3(3.2, 0, 0);
  private modelsReady = false;
  private lastRenderMs = performance.now();

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(canvas.width, canvas.height, false);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.4;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x090e14);
    this.scene.fog = new THREE.FogExp2(0x090e14, 0.015);

    this.camera = new THREE.PerspectiveCamera(38, canvas.width / canvas.height, 0.4, 120);
    this.camera.position.set(1, 15.8, 14.6);

    this.ambient = new THREE.HemisphereLight(0x8bb6df, 0x1c1714, 1.15);
    this.scene.add(this.ambient);

    this.sun = new THREE.DirectionalLight(0xdcebff, 1.9);
    this.sun.position.set(10, 22, 12);
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
    rimLight.position.set(-14, 9, -12);
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
    outerRet.rotation.x = -Math.PI / 2;
    const innerRet = new THREE.Mesh(
      new THREE.CircleGeometry(0.1, 16),
      new THREE.MeshBasicMaterial({ color: 0xff6b3d, side: THREE.DoubleSide }),
    );
    innerRet.rotation.x = -Math.PI / 2;
    this.reticleGroup.add(outerRet, innerRet);
    this.scene.add(this.reticleGroup);

    this.wardenTelegraphRing = new THREE.Mesh(
      new THREE.RingGeometry(0.9, 1.35, 32),
      new THREE.MeshBasicMaterial({ color: 0xff3b2f, side: THREE.DoubleSide, transparent: true, opacity: 0.75 }),
    );
    this.wardenTelegraphRing.rotation.x = -Math.PI / 2;
    this.wardenTelegraphRing.visible = false;
    this.scene.add(this.wardenTelegraphRing);

    this.scene.add(this.dynGroup);

    // Post-processing with selective bloom & tone-mapped output
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2)),
      0.42,
      0.32,
      0.84,
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
    return {
      modelsLoaded: this.modelsReady,
      loadedModels: getLoadedModelNames3D(),
      failedModels: getFailedModelNames3D(),
      riggedCount: (this.operativeRig ? 1 : 0) + this.riggedEnemies.size,
      activeAnimations,
    };
  }

  /** Converts normalized canvas cursor coordinates (-1..1 NDC) into exact 3D world aim coordinates. */
  public screenToWorldAim(ndcX: number, ndcY: number, w: WorldState3D): { x: number; y: number; z: number } {
    this.raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);
    const ray = this.raycaster.ray;
    const planeY = w.player.body.y + 1.1;

    // Intersect player-height aiming plane first
    let hx = w.player.body.x + Math.sin(w.player.aimYaw) * 8;
    let hy = planeY;
    let hz = w.player.body.z + Math.cos(w.player.aimYaw) * 8;
    if (Math.abs(ray.direction.y) > 1e-4) {
      const t = (planeY - ray.origin.y) / ray.direction.y;
      if (t > 0 && t < 80) {
        hx = ray.origin.x + ray.direction.x * t;
        hz = ray.origin.z + ray.direction.z * t;
      }
    }

    // Soft vertical snap toward any alive enemy or Power Core under the ray
    const tmpSphere = new THREE.Sphere();
    const hitPt = new THREE.Vector3();
    let bestEnemyDist = Infinity;
    for (const e of w.enemies) {
      if (!e.alive) continue;
      tmpSphere.set(new THREE.Vector3(e.x, e.y + e.height * 0.55, e.z), e.radius + 0.65);
      if (ray.intersectSphere(tmpSphere, hitPt)) {
        const d = hitPt.distanceTo(ray.origin);
        if (d < bestEnemyDist) {
          bestEnemyDist = d;
          hx = e.x;
          hy = e.y + e.height * 0.55;
          hz = e.z;
        }
      }
    }
    if (!w.coreDestroyed && bestEnemyDist === Infinity) {
      tmpSphere.set(new THREE.Vector3(w.level.corePos.x, 1.35, w.level.corePos.z), 1.9);
      if (ray.intersectSphere(tmpSphere, hitPt)) {
        hx = w.level.corePos.x;
        hy = 1.35;
        hz = w.level.corePos.z;
      }
    }

    return { x: hx, y: hy, z: hz };
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
          emissiveIntensity: 1.35,
          roughness: 0.15,
        }),
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set((pool.minX + pool.maxX) * 0.5, pool.surfaceY, (pool.minZ + pool.maxZ) * 0.5);
      this.scene.add(mesh);
      this.acidMeshes.push(mesh);

      const acidLight = new THREE.PointLight(0x6dff3a, 5, 11, 1.5);
      acidLight.position.set(mesh.position.x, 1.1, mesh.position.z);
      this.scene.add(acidLight);
    }

    // Security Console holographic beacon
    this.consoleRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.65, 0.05, 8, 24),
      new THREE.MeshStandardMaterial({ color: 0x2bf0ff, emissive: 0x2bf0ff, emissiveIntensity: 1.8 }),
    );
    this.consoleRing.rotation.x = Math.PI / 2;
    this.consoleRing.position.set(w.level.consolePos.x, w.level.consolePos.y + 1.45, -6.8);
    this.scene.add(this.consoleRing);

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
      mat = new THREE.MeshStandardMaterial({
        map: tex.hazardMap,
        color: s.color ?? 0x452220,
        emissive: s.emissive ?? 0xff4526,
        emissiveIntensity: 0.8,
        roughness: 0.35,
        metalness: 0.72,
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

    const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
    mesh.position.set(cx, cy, cz);
    mesh.castShadow = s.kind !== 'catwalk' || s.minY >= 0.5;
    mesh.receiveShadow = true;
    this.scene.add(mesh);

    if (s.doorId) {
      this.doorMeshes.set(s.doorId, { mesh, baseY: cy });
    } else if (s.kind === 'wall' && !s.visualMaxY && s.maxY > 2.5 && s.minZ > -2.5) {
      mat.transparent = true;
      this.occludables.push({ mesh, mat, center: mesh.position.clone() });
    }
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
        this.scene.add(rig.root);
        this.riggedEnemies.set(e.id, rig);
      } else {
        const key = e.kind === 'spitter' ? 'spitter' : 'crawler';
        const h = e.kind === 'spitter' ? 1.5 : 0.85;
        const st = instantiateStaticModel3D(key, h, true);
        st.root.position.set(e.x, e.y, e.z);
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
    this.coreShield.position.set(w.level.corePos.x, 1.55, w.level.corePos.z);
    this.scene.add(this.coreShield);

    // Exit Gate & Portal Ring
    const exit = instantiateStaticModel3D('exit-gate', 4.2, true);
    exit.root.rotation.y = Math.PI / 2;
    exit.root.position.set(w.level.exitPos.x + 1.0, w.level.exitPos.y, w.level.exitPos.z);
    this.exitModel = exit.root;
    this.scene.add(this.exitModel);

    this.exitPortalRing = new THREE.Mesh(
      new THREE.TorusGeometry(1.5, 0.08, 10, 32),
      new THREE.MeshStandardMaterial({ color: 0x3dff9e, emissive: 0x3dff9e, emissiveIntensity: 1.9 }),
    );
    this.exitPortalRing.rotation.y = Math.PI / 2;
    this.exitPortalRing.position.set(w.level.exitPos.x + 0.7, 2.05, w.level.exitPos.z);
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

  public render(w: WorldState3D): void {
    const now = performance.now();
    const dt = Math.min(0.05, Math.max(0.001, (now - this.lastRenderMs) / 1000));
    this.lastRenderMs = now;
    const tSec = now * 0.001;

    this.ensureWorldBuilt(w);

    // 1. Update doors
    for (const [id, entry] of this.doorMeshes) {
      const targetY = w.openDoors.has(id) ? entry.baseY + 4.35 : entry.baseY;
      entry.mesh.position.y += (targetY - entry.mesh.position.y) * Math.min(1, dt * 8);
    }

    // 2. Acid UV scroll & Console pulse
    for (const am of this.acidMeshes) {
      const mat = am.material as THREE.MeshStandardMaterial;
      if (mat.emissiveMap) {
        mat.emissiveMap.offset.x = (tSec * 0.08) % 1;
        mat.emissiveMap.offset.y = (Math.sin(tSec * 1.4) * 0.06);
      }
    }
    if (this.consoleRing) {
      const mat = this.consoleRing.material as THREE.MeshStandardMaterial;
      mat.color.setHex(w.consoleUnlocked ? 0x3dff9e : 0x2bf0ff);
      mat.emissive.setHex(w.consoleUnlocked ? 0x3dff9e : 0x2bf0ff);
      this.consoleRing.rotation.z = tSec * 1.6;
    }

    // 3. Meltdown lighting ambiance
    const inMeltdown = w.coreDestroyed && w.meltdownTicks >= 0;
    if (inMeltdown) {
      const pulse = 0.5 + 0.5 * Math.sin(tSec * 8.5);
      this.alarmLight.intensity = 14 + pulse * 18;
      this.alarmLight.position.set(w.player.body.x, 4.2, w.player.body.z);
      this.ambient.color.setHex(0xc96b6b);
    } else {
      this.alarmLight.intensity = 0;
      this.ambient.color.setHex(0x8bb6df);
    }

    // 4. Operative rigged character + twin-stick animation + laser sight + R3.3 headlamp
    const p = w.player;
    const pb = p.body;
    if (this.operativeRig) {
      const rig = this.operativeRig;
      rig.root.position.set(pb.x, pb.y, pb.z);

      const moveSpeed = Math.hypot(pb.vx, pb.vz);
      const moveYaw = moveSpeed > 0.4 ? Math.atan2(pb.vx, pb.vz) : p.aimYaw;
      const moveAimDot =
        moveSpeed > 0.4 ? (pb.vx / moveSpeed) * Math.sin(p.aimYaw) + (pb.vz / moveSpeed) * Math.cos(p.aimYaw) : 1;

      const desiredAnim: ActorAnimAction =
        p.hp <= 0
          ? 'death'
          : !pb.grounded
            ? 'jump'
            : pb.dashTicks > 0 || moveSpeed > 1.2
              ? 'run'
              : p.fireCooldown > 0 && p.weapon === 1 && p.muzzleFlashTicks > 0
                ? 'attack'
                : 'idle';

      const timeScale = moveSpeed > 1.2 ? (moveAimDot < -0.25 ? -0.95 : 1.08) : 1.0;

      // Rotate character smoothly toward cursor aimYaw (snap immediately on large respawn/zone jumps)
      const diff = wrapAngleDiff(p.aimYaw, rig.root.rotation.y);
      if (Math.abs(diff) > 2.8 && w.tick <= 2) rig.root.rotation.y = p.aimYaw;
      else rig.root.rotation.y += diff * Math.min(1, dt * 18);
      const upperTwist = moveSpeed > 1.0 ? wrapAngleDiff(p.aimYaw, moveYaw) * 0.25 : 0;

      stepRiggedAnimation3D(rig, desiredAnim, dt, timeScale, upperTwist, p.hp > 0);
      rig.root.updateMatrixWorld(true);

      if (p.hurtFlashTicks > 0) flashRiggedMaterials3D(rig, 0xff2f2f, 0.75);
      else if (p.dashInvulnTicks > 0) flashRiggedMaterials3D(rig, 0x2bf0ff, 0.55);
      else flashRiggedMaterials3D(rig, 0x000000, 0);

      // Muzzle world origin + Cyan Laser Sight + Target Reticle
      const muzzlePos = new THREE.Vector3();
      if (rig.muzzleLocal) rig.muzzleLocal.getWorldPosition(muzzlePos);
      else muzzlePos.set(pb.x + Math.sin(p.aimYaw) * 0.85, pb.y + 1.15, pb.z + Math.cos(p.aimYaw) * 0.85);

      const endPos = new THREE.Vector3(p.aimX, Math.max(0.35, p.aimY), p.aimZ);
      const posAttr = this.laserGeom.attributes.position as THREE.BufferAttribute;
      posAttr.setXYZ(0, muzzlePos.x, muzzlePos.y, muzzlePos.z);
      posAttr.setXYZ(1, endPos.x, endPos.y, endPos.z);
      posAttr.needsUpdate = true;

      this.reticleGroup.position.set(p.aimX, Math.max(0.08, p.aimY - 0.85), p.aimZ);
      this.reticleGroup.rotation.y = tSec * 3.2;

      const flashOn = p.muzzleFlashTicks > 0;
      this.muzzleLight.intensity = flashOn ? 14 : 0;
      this.muzzleLight.position.copy(muzzlePos);

      // R3.3 Headlamp (100% visual-only)
      this.headlamp.intensity = w.light.on ? 34 : 0;
      this.headlampCone.visible = w.light.on;
      if (w.light.on) {
        const hx = pb.x + Math.sin(p.aimYaw) * 0.35;
        const hy = pb.y + 1.55;
        const hz = pb.z + Math.cos(p.aimYaw) * 0.35;
        this.headlamp.position.set(hx, hy, hz);
        this.headlampTarget.position.set(p.aimX, Math.max(0.4, p.aimY), p.aimZ);
        this.headlampCone.position.set(hx, hy, hz);
        this.headlampCone.lookAt(this.headlampTarget.position);
      }
    }

    // 5. Enemies (Rigged Skeletal & Static Meshes)
    let telegraphWarden: WorldState3D['enemies'][number] | null = null;
    for (const e of w.enemies) {
      const rig = this.riggedEnemies.get(e.id);
      if (rig) {
        rig.root.position.set(e.x, e.y, e.z);
        rig.root.rotation.y = e.yaw;
        stepRiggedAnimation3D(rig, e.alive ? e.anim : 'death', dt, e.kind === 'warden' && e.phase === 2 ? 1.25 : 1.0);
        if (e.hitFlashTicks > 0) {
          flashRiggedMaterials3D(rig, 0xff7755, 0.32);
        } else if (e.kind === 'warden' && e.windupTicks > 0) {
          flashRiggedMaterials3D(rig, 0xff451f, 0.22);
        } else if (e.kind === 'warden' && e.phase === 2 && e.alive) {
          flashRiggedMaterials3D(rig, 0xff3b18, 0.09);
        } else {
          flashRiggedMaterials3D(rig, 0x000000, 0);
        }
        if (e.kind === 'warden' && e.alive && e.windupTicks > 0) telegraphWarden = e;
        continue;
      }

      const st = this.staticEnemies.get(e.id);
      if (st) {
        if (!e.alive) {
          st.root.rotation.z += (Math.PI * 0.48 - st.root.rotation.z) * Math.min(1, dt * 8);
          st.root.visible = e.deathTicks < 240;
        } else {
          const bob = e.kind === 'spitter' ? Math.sin(tSec * 4 + e.x) * 0.14 : Math.abs(Math.sin(tSec * 12 + e.x)) * 0.08;
          st.root.position.set(e.x, e.y + bob, e.z);
          st.root.rotation.y = e.yaw;
          const fAmt = e.hitFlashTicks > 0 ? 0.7 : 0;
          for (let i = 0; i < st.materials.length; i++) {
            st.materials[i].emissive.copy(st.baseEmissive[i]).lerp(new THREE.Color(0xffffff), fAmt);
          }
        }
      }
    }

    if (telegraphWarden) {
      this.wardenTelegraphRing.visible = true;
      const pct = 1 - telegraphWarden.windupTicks / (telegraphWarden.phase === 2 ? 28 : 36);
      this.wardenTelegraphRing.position.set(telegraphWarden.x, telegraphWarden.y + 0.1, telegraphWarden.z);
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
        h.root.position.set(b.x, b.y, b.z);
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
      g.position.set(pk.x, pk.y, pk.z);
      if (g.children[1]) {
        g.children[1].rotation.y = tSec * 2.1;
        g.children[1].position.y = (pk.kind === 'weapon' ? 0.95 : 0.65) + Math.sin(tSec * 3.4) * 0.12;
      }
    }

    // 7. Dynamic Projectiles, Shockwaves, Explosions & Rail Beams
    this.syncDynamicFX(w, dt);

    // 8. Quarter-View Camera + Cursor Look-ahead + Shake + Directional Shadow Anchor
    const aimOffX = Math.max(-1.6, Math.min(1.6, (p.aimX - pb.x) * 0.18));
    const aimOffZ = Math.max(-1.4, Math.min(1.4, (p.aimZ - pb.z) * 0.18));
    const targetFocus = new THREE.Vector3(pb.x + aimOffX, pb.y + 0.85, pb.z + aimOffZ);
    if (this.camFocus.distanceTo(targetFocus) > 6.5) this.camFocus.copy(targetFocus);
    else this.camFocus.lerp(targetFocus, Math.min(1, dt * 11));

    const sx = w.shakeTicks > 0 ? Math.sin(w.tick * 2.1) * w.shakeStrength : 0;
    const sz = w.shakeTicks > 0 ? Math.cos(w.tick * 2.7) * w.shakeStrength : 0;
    this.camera.position.set(this.camFocus.x - 2.2 + sx, this.camFocus.y + 15.6, this.camFocus.z + 14.4 + sz);
    this.camera.lookAt(this.camFocus);

    this.sun.position.set(pb.x + 10, pb.y + 22, pb.z + 12);
    this.sun.target.position.set(pb.x, pb.y, pb.z);
    this.sun.target.updateMatrixWorld();

    // 9. Auto-fade foreground tall walls/pillars between camera and player
    const camDist = this.camera.position.distanceTo(this.camFocus);
    for (const occ of this.occludables) {
      const toObjDist = occ.center.distanceTo(this.camera.position);
      const nearCam = toObjDist < camDist - 1.2 && Math.abs(occ.center.x - pb.x) < 6.5 && occ.center.z > pb.z + 1.5;
      const wantOpacity = nearCam ? 0.24 : 1.0;
      occ.mat.opacity += (wantOpacity - occ.mat.opacity) * Math.min(1, dt * 10);
      occ.mat.depthWrite = occ.mat.opacity > 0.8;
    }

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
      mesh.position.set(pr.x, pr.y, pr.z);
    }
    for (const [id, m] of this.projMeshes) {
      if (!liveProj.has(id)) {
        this.dynGroup.remove(m);
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
        this.projMeshes.delete(id);
      }
    }

    // Boss Shockwave Rings (crisp outer+inner volumetric ground ring — Jumpable!)
    const liveSw = new Set<number>();
    for (const sw of w.shockwaves) {
      liveSw.add(sw.id);
      let mesh = this.ringMeshes.get(sw.id);
      if (!mesh) {
        mesh = new THREE.Mesh(
          new THREE.RingGeometry(0.92, 1.0, 56),
          new THREE.MeshBasicMaterial({
            color: sw.phase === 2 ? 0xff2944 : 0xff7b26,
            transparent: true,
            opacity: 0.9,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          }),
        );
        mesh.rotation.x = -Math.PI / 2;
        this.dynGroup.add(mesh);
        this.ringMeshes.set(sw.id, mesh);
      }
      mesh.position.set(sw.x, sw.y + 0.14, sw.z);
      mesh.scale.set(sw.radius, sw.radius, 1);
    }
    for (const [id, m] of this.ringMeshes) {
      if (!liveSw.has(id)) {
        this.dynGroup.remove(m);
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
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
      mesh.position.set(ex.x, ex.y, ex.z);
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
      const a = new THREE.Vector3(bm.x1, bm.y1, bm.z1);
      const b = new THREE.Vector3(bm.x2, bm.y2, bm.z2);
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
