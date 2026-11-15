// Full 3D Side-View Metroidvania Three.js WebGL2 Renderer for REANIMATOR.
// The camera looks down -Z at the z = 0 gameplay lane (2.5D). Drives rigged SkinnedMesh animations via AnimationMixer,
// two-handed rifle IK (riggedModels.ts), z = 0 cursor raycasting, selective UnrealBloomPass, PCFShadowMap,
// 60 -> display-rate interpolation, and the R3.3 visual-only headlamp.

import * as THREE from 'three';
import { DEATH_POP_CAP, HIT_FLASH_HEX, deathPopAmount, hitFlashAmount, playerHurtFlashAmount } from './vfxStyle3d.ts';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { BOSS_PHASE_COLORS, createPostParams, FxDirector, stepPostParams } from './fx3d.ts';
import { BossTelegraph3D } from './bossTelegraph3d.ts';
import { BossIntroOverlay, introState, nextIntroDisplayTicks, type IntroState } from './cinematic3d.ts';
import { PopupLayer } from './popups3d.ts';
import { CLASSIC_GLOW_SPRITE_SCALE, ClassicPipeline, classicOrthoHalf, remapNdcToClassic, type ViewMode } from './classicView.ts';
import { buildBootsItem, buildEnergyTankItem, buildSaveStation, createHoloMaterial, createShieldMaterial, type SaveStationProps } from './propsGfx.ts';
import { applyPostParams, createFireballMaterial, createGroundWaveMaterial, createPostPass, createShockRingMaterial, ParticleLayer } from './fx3dGfx.ts';
import type { SectorId3D } from '../game3d/types3d.ts';
import type { MapSolid3D, Ramp3D, WeaponSlot3D } from '../game3d/map3d.ts';
import { getPlayerPose3D, RAIL_CHARGE_TICKS, skipBossIntro3D, type ActorAnimAction, type WorldState3D } from '../game3d/world3d.ts';
import { HeroController, type HeroFrame } from './heroPose.ts';
import { HeroGear } from './heroGear3d.ts';
import {
  applyEnemyRim3D,
  flashMaterials3D,
  flashRiggedMaterials3D,
  getFailedModelNames3D,
  getLoadedModelNames3D,
  instantiateRiggedModel3D,
  instantiateStaticModel3D,
  preloadAllModels3D,
  stepRiggedAnimation3D,
  stepEnemyRigAnimation3D,
  applyEnemyRigChannels3D,
  tuneEnemyMaterials3D,
  tuneWardenMaterials3D,
  WARDEN_FLASH_SCALE_3D,
  type RiggedInstance,
} from './riggedModels.ts';
import { EnemyRigDriver, ProcSecondary, type EnemyRigFrame } from './enemyRig3d.ts';
import {
  gaitStep,
  proceduralEnemyPose,
  stepEnemyYaw,
  type EnemyRenderTelemetry,
} from './enemyMotion.ts';
import { getFacilityTextures3D } from './textures3d.ts';
import { ChunkLayer, DecalLayer } from './gore3dGfx.ts';
import { buildMood3D, type Mood3D } from './mood3dGfx.ts';
import { reactorPulse } from './mood3d.ts';
import { bossCameraBlend, bossFramingWanted } from './bossCamera.ts';
import { CAM_BASE_DIST, clampFocusToRect, dynamicZoomTarget, frameHalfExtents, FrameRectSmoother, sectorCameraHint, stepZoom, verticalFocusOffset } from './cameraFrame.ts';
import { applyFrontLift } from './frontLift.ts';
import { mergeStaticChildren } from './meshMerge.ts';
import { buildHazards3D, type Hazards3D } from './hazards3d.ts';
import { buildAmmoItem, buildMetroid3D, buildSlideItem, type Metroid3D } from './metroid3d.ts';
import { buildDecor3D, buildDoorDressingMeshes, SECTOR_FOG, type Decor3D } from './decor3d.ts';
import { buildVista3D, type Vista3D } from './vista3d.ts';
import { batchKeyFor, buildBatchGeometry, classifySolid, type BatchItem, type SolidClass } from './solidBatches.ts';

/** Static scenery that is hidden while it is outside the camera window (render-only). */
interface CullEntry {
  obj: THREE.Object3D;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}
interface PendingBatch {
  sector: SectorId3D;
  cls: SolidClass;
  items: BatchItem[];
}

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

/** Render-only material identity per sector (trim palette and texture choice). */
interface SectorLook {
  plates: number[];
  lip: number;
  flange: number;
  rivet: number;
  brace: number;
  tint: number;
}
const SECTOR_LOOK: Record<SectorId3D, SectorLook> = {
  airlock: { plates: [0x4a5a6a, 0x3c4a5a, 0x56687a], lip: 0x2bb8c8, flange: 0x2c343e, rivet: 0x8a9aac, brace: 0x46586a, tint: 1 },
  shaft: { plates: [0x5a4c3e, 0x4a3e34, 0x6a5848], lip: 0xc98a2a, flange: 0x2e2822, rivet: 0x9a8a78, brace: 0x6a5848, tint: 1 },
  mines: { plates: [0x4a4036, 0x3a3128, 0x5a4a3a], lip: 0x8a6a3a, flange: 0x4a3420, rivet: 0x7a6a58, brace: 0x6a4a2a, tint: 1 },
  biolabs: { plates: [0x6a8a84, 0x587a74, 0x7a9a94], lip: 0x58e0a8, flange: 0x2a3a38, rivet: 0xa8c8c0, brace: 0x4a6a64, tint: 0.7 },
  security: { plates: [0x424c5c, 0x363e4c, 0x4e5a6c], lip: 0xc03838, flange: 0x1a1f27, rivet: 0x7a8696, brace: 0x56626f, tint: 1 },
  core: { plates: [0x4a2a24, 0x3a201a, 0x5a3228], lip: 0xd05a22, flange: 0x2a1a18, rivet: 0x8a5a48, brace: 0x9a3a1a, tint: 1 },
};

type TexKey = 'rockMap' | 'cleanTileMap' | 'panelMap' | 'concreteMap' | 'rustMetalMap';
/** Texture identity per sector: wall map, ground-floor map (undefined keeps the deck plate), grate tint. */
const SECTOR_SURFACE: Record<SectorId3D, { wall?: TexKey; floor?: TexKey; tint: number; grate: number }> = {
  airlock: { tint: 0xffffff, grate: 0x99b0c7 },
  shaft: { wall: 'rustMetalMap', tint: 0xe8d8c8, grate: 0xb0a090 },
  mines: { wall: 'rockMap', floor: 'rockMap', tint: 0xffffff, grate: 0xa89478 },
  biolabs: { wall: 'cleanTileMap', floor: 'cleanTileMap', tint: 0xb4b4b4, grate: 0xb0d4cc },
  security: { wall: 'panelMap', floor: 'panelMap', tint: 0xffffff, grate: 0x9aa4b8 },
  core: { wall: 'concreteMap', floor: 'concreteMap', tint: 0xe0b8a8, grate: 0xc09484 },
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
  gait: number;
  land: number;
  stagger: number;
  prevVy: number;
  /** Rigged foes only: bone-channel driver (render-only) and its LOD accumulator */
  rig?: EnemyRigDriver;
  lodAcc: number;
  lastFrame?: EnemyRigFrame;
  sec?: ProcSecondary;
}

const ENEMY_TINT_3D: Record<string, number> = { stalker: 0xd8f5d0, crawler: 0xf0c8b8, spitter: 0xdcc8f5, warden: 0xffd8b0 };
const ENEMY_WINDUP_TOTAL_3D: Record<string, number> = { crawler: 14, stalker: 18, spitter: 12, warden: 36 };
const ENEMY_RIM_3D: Record<string, number> = { stalker: 0x9dffb4, crawler: 0xffb090, spitter: 0xd0b0ff, warden: 0xffa070 };
/** Slightly taller than the operative (1.82 m) so the stalker reads as a threat against the backdrop. */
const STALKER_HEIGHT_3D = 2.0;
const TELEGRAPH_POOL_3D = 6;

/** Soft radial-gradient texture for floor telegraph markers (no hard edges). */
function makeSoftDecalTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

/** Procedural cracked-stone wall for secret rooms: dark fissures plus a faint amber glow leaking through. Deterministic. */
function makeCrackedWallTextures(w: number, h: number): { color: THREE.CanvasTexture; glow: THREE.CanvasTexture } {
  const W = 128;
  const H = Math.max(128, Math.min(512, Math.round((128 * h) / Math.max(0.5, w))));
  const mk = (): [HTMLCanvasElement, CanvasRenderingContext2D] => {
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    return [c, c.getContext('2d')!];
  };
  const [cc, cg] = mk();
  const [gc, gg] = mk();
  cg.fillStyle = '#6f675e';
  cg.fillRect(0, 0, W, H);
  let seed = 1234567;
  const rnd = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 260; i++) {
    const v = 90 + Math.floor(rnd() * 50);
    cg.fillStyle = `rgba(${v},${v - 4},${v - 10},0.35)`;
    cg.fillRect(rnd() * W, rnd() * H, 2 + rnd() * 10, 2 + rnd() * 6);
  }
  gg.fillStyle = '#000';
  gg.fillRect(0, 0, W, H);
  for (let k = 0; k < 5; k++) {
    let x = rnd() * W;
    let y = rnd() * H * 0.2;
    const pts: [number, number][] = [[x, y]];
    while (y < H) {
      x += (rnd() - 0.5) * 26;
      y += 8 + rnd() * 16;
      pts.push([x, y]);
    }
    for (const [ctx, col, wd] of [[cg, '#17120e', 3.2], [gg, '#ffb02e', 1.6]] as const) {
      ctx.strokeStyle = col;
      ctx.lineWidth = wd;
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (const q of pts) ctx.lineTo(q[0], q[1]);
      ctx.stroke();
    }
  }
  const color = new THREE.CanvasTexture(cc);
  color.colorSpace = THREE.SRGBColorSpace;
  return { color, glow: new THREE.CanvasTexture(gc) };
}

const _MELT_BG = new THREE.Color(0x3a0508);
const _MELT_RED = new THREE.Color(0xff2a2a);
const _FLASH_TMP = new THREE.Color();
const _PHASE_TMP = new THREE.Color();
const BOSS_PHASE_HEX = [0x33ffe0, 0xff8c26, 0xff2418] as const;

function wrapAngle(d: number): number {
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

interface PosSnap {
  x: number;
  y: number;
}

/** Ambient and sun multiplier while the headlamp is off (the lamp-on level is the preset). */
const LAMP_OFF_DIM = 0.78;
const HEADLAMP_INTENSITY = 90;

const SECTOR_LIGHT: Record<SectorId3D, { sky: THREE.Color; sun: THREE.Color; ambient: number; sunI: number; bloom: number }> = {
  // Round 3 mood pass: lower ambient and sun for deep shadow, rust / drab-green tints. `ambient` is the headlamp-on
  // level; LAMP_OFF_DIM scales it down when the lamp is off (render only, R3.3).
  airlock: { sky: new THREE.Color(0x748ea0), sun: new THREE.Color(0xcfdbe2), ambient: 0.98, sunI: 1.3, bloom: 0.32 },
  shaft: { sky: new THREE.Color(0x85725c), sun: new THREE.Color(0xe6caa0), ambient: 0.95, sunI: 1.3, bloom: 0.3 },
  mines: { sky: new THREE.Color(0x76593a), sun: new THREE.Color(0xffb870), ambient: 0.88, sunI: 1.2, bloom: 0.38 },
  biolabs: { sky: new THREE.Color(0x628560), sun: new THREE.Color(0xc4e2a8), ambient: 0.92, sunI: 1.25, bloom: 0.4 },
  security: { sky: new THREE.Color(0x66708a), sun: new THREE.Color(0xd2d8ee), ambient: 0.95, sunI: 1.3, bloom: 0.34 },
  core: { sky: new THREE.Color(0x854636), sun: new THREE.Color(0xff9a70), ambient: 0.9, sunI: 1.25, bloom: 0.42 },
};

export class Scene3DRenderer {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  /** Classic View: flat orthographic side view. It follows the perspective camera's pose, so all rig/shake logic is shared. */
  private readonly orthoCamera = new THREE.OrthographicCamera(-7, 7, 4.6, -4.6, 0.1, 120);
  private viewMode: ViewMode = 'modern';
  private crtOn = false;
  private classic: ClassicPipeline | null = null;
  private readonly composer: EffectComposer;
  private readonly bloomPass: UnrealBloomPass;
  /** Game-feel layer (shake, hit-stop, particles, post params). main.ts drives observe() once per sim tick. */
  public readonly fx = new FxDirector();
  private readonly fxAdd: ParticleLayer;
  private readonly fxAlpha: ParticleLayer;
  private readonly fxSmoke: ParticleLayer;
  private readonly goreChunks: ChunkLayer;
  private readonly goreDecals: DecalLayer;
  private mood: Mood3D | null = null;
  /** Smoothed 0..1 headlamp state for lighting (render only). */
  private lampK = 0;
  private readonly postPass: ShaderPass;
  private readonly postParams = createPostParams();
  private readonly baseFov = 38;
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

  private readonly bossTele = new BossTelegraph3D();
  private readonly popupLayer: PopupLayer;
  private readonly introOverlay = new BossIntroOverlay(() => this.renderer.domElement.parentElement);
  private introSkipPending = false;
  /** Display-side intro countdown (see nextIntroDisplayTicks): keeps the cinematic playing while the world is frozen. */
  private introDisplayTicks = 0;
  private introSimTicks = 0;
  private introRoared = false;
  private introPan = 0;
  private introZoom = 0;
  private introAwake = 0;
  /** Smoothed 0..1 weight that pulls the camera toward the Core Warden so the boss stays on screen. */
  private bossFrameK = 0;
  private readonly frameRect = new FrameRectSmoother();
  private camZoomK = 1;
  private readonly camProbe = new THREE.Vector3();
  private camRoomClamp = false;
  private camPlayerScreenY = 0.5;
  private camHalfH = 4.6;
  private introLast: IntroState = introState(0);
  private secretDoorIds = new Set<string>();

  private operativeRig: RiggedInstance | null = null;
  private heroGear: HeroGear | null = null;
  private readonly heroCtl = new HeroController();
  private heroFrame: HeroFrame | null = null;
  private heroMuzzle = { x: 0, y: 0, z: 0 };
  private wardenTelegraphRing: THREE.Mesh;
  private readonly enemyViz = new Map<string, EnemyViz>();
  private readonly lungeDecals: THREE.Mesh[] = [];
  private trimMesh: THREE.InstancedMesh | null = null;
  private readonly muzzleGlows: THREE.Mesh[] = [];
  private readonly riggedEnemies = new Map<string, RiggedInstance>();
  private readonly pickProxyMaterial = new THREE.MeshBasicMaterial({ visible: false });
  private readonly enemyRenderInfo = new Map<string, Partial<EnemyRenderTelemetry> & { yaw: number; x: number; y: number; z: number }>();
  private readonly staticEnemies = new Map<string, StaticActorHandle>();
  private readonly barrelHandles = new Map<string, StaticActorHandle>();
  private readonly hiveHandles = new Map<string, { root: THREE.Group; core: THREE.Mesh; mat: THREE.MeshStandardMaterial }>();
  private readonly pickupHandles = new Map<string, THREE.Group>();
  private readonly doorMeshes = new Map<string, { mesh: THREE.Mesh; baseY: number; height: number }>();
  private doorLamps: THREE.InstancedMesh | null = null;
  private readonly doorLampIdx = new Map<string, { idx: number[]; color: number; open: boolean }>();
  private rooms: WorldState3D['level']['rooms'] = [];
  private readonly upgradeMeshes = new Map<string, THREE.Object3D>();
  private readonly savePads: THREE.Mesh[] = [];
  private readonly saveMachines: SaveStationProps[] = [];
  private readonly holoMats: THREE.ShaderMaterial[] = [];
  private logHolo: THREE.ShaderMaterial | null = null;
  private shieldMat: THREE.ShaderMaterial | null = null;
  private lastTick = -1;
  private airTime = 0;
  private prevPlayer: PosSnap = { x: 0, y: 0 };
  private curPlayer: PosSnap = { x: 0, y: 0 };
  private readonly lastEnemyStates = new Map<string, string>();
  private prevEnemies = new Map<string, PosSnap>();
  private curEnemies = new Map<string, PosSnap>();
  private readonly occludables: OccludableMesh[] = [];
  private readonly pendingBatches = new Map<string, PendingBatch>();
  private readonly cullEntries: CullEntry[] = [];
  private decor: Decor3D | null = null;
  private vista: Vista3D | null = null;
  private hazards3d: Hazards3D | null = null;
  private metroid3d: Metroid3D | null = null;
  private slideSquash = 0;
  private fogDensity = 0.012;
  private readonly presetSky = new THREE.Color(0x8bb6df);
  private readonly presetSun = new THREE.Color(0xdcebff);
  private presetAmbI = 1.35;
  private presetSunI = 1.9;
  private readonly trimSpecs: { x: number; y: number; z: number; sx: number; sy: number; sz: number; color: number; rz?: number }[] = [];

  private coreModel: THREE.Group | null = null;
  private coreShield: THREE.Mesh | null = null;
  private exitModel: THREE.Group | null = null;
  private exitPortalRing: THREE.Mesh | null = null;
  private consoleRing: THREE.Mesh | null = null;
  private acidMeshes: THREE.Mesh[] = [];
  private builtLevelRef: WorldState3D['level'] | null = null;
  private lastWorldRef: WorldState3D | null = null;

  private readonly dynGroup = new THREE.Group();
  private readonly ringMeshes = new Map<number, THREE.Mesh>();
  private readonly explMeshes = new Map<number, THREE.Group>();
  private readonly blastSphere = new THREE.SphereGeometry(1, 24, 18);
  private readonly blastPlane = new THREE.PlaneGeometry(1, 1);
  private readonly beamMeshes = new Map<number, THREE.Mesh>();

  private readonly camFocus = new THREE.Vector3(3.5, 1.2, 0);
  /** Title attract mode: seconds driving a slow cinematic camera drift, or null for the normal follow camera. */
  private attractT: number | null = null;
  private attractShot: { dolly: number; sway: number; lift: number; lookDown: number } | null = null;
  private modelsReady = false;
  private lastRenderMs = performance.now();

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.info.autoReset = false;
    this.renderer.setSize(canvas.width, canvas.height, false);
    // GPU context loss: stop drawing, let the browser restore (preventDefault), and tell the UI. three.js re-uploads
    // buffers and textures lazily after restore. A canvas that already holds a WebGL context cannot switch to 2D.
    canvas.addEventListener('webglcontextlost', (ev) => {
      ev.preventDefault();
      this.contextLost = true;
      this.onContextChange?.(true);
    });
    canvas.addEventListener('webglcontextrestored', () => {
      this.contextLost = false;
      this.lastRenderMs = performance.now();
      this.onContextChange?.(false);
    });
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
    this.sun.shadow.camera.far = 48;
    const d = 18;
    this.sun.shadow.camera.left = -d;
    this.sun.shadow.camera.right = d;
    this.sun.shadow.camera.top = d;
    this.sun.shadow.camera.bottom = -d;
    this.sun.shadow.bias = -0.0008;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    const rimLight = new THREE.DirectionalLight(0x4fd8e8, 1.25);
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
        opacity: 0.075,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    this.scene.add(this.headlampCone);

    // Visual-only fill light so the operative stays readable in dark shafts
    this.fillLight = new THREE.PointLight(0xbfe6ff, 11, 12, 1.4);
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
    const decalGeo = new THREE.PlaneGeometry(1, 1);
    decalGeo.rotateX(-Math.PI / 2);
    const decalTex = makeSoftDecalTexture();
    const glowGeo = new THREE.SphereGeometry(1, 12, 8);
    for (let i = 0; i < TELEGRAPH_POOL_3D; i++) {
      const d = new THREE.Mesh(
        decalGeo,
        new THREE.MeshBasicMaterial({ map: decalTex, color: 0xff4a1f, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending }),
      );
      d.name = 'telegraph:lunge';
      d.renderOrder = 2;
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
    this.postPass = createPostPass();
    this.composer.addPass(this.postPass);
    this.fxAdd = new ParticleLayer(this.fx.add, true, false);
    this.fxAlpha = new ParticleLayer(this.fx.alpha, false, true);
    this.fxSmoke = new ParticleLayer(this.fx.smoke, false, false);
    this.fxSmoke.mesh.renderOrder = 18;
    this.fxSmoke.mesh.name = 'fx-particles-smoke';
    this.goreChunks = new ChunkLayer(this.fx.gore.chunks);
    this.goreDecals = new DecalLayer(this.fx.gore.decals);
    this.scene.add(this.goreDecals.mesh);
    this.scene.add(this.goreChunks.mesh);
    this.scene.add(this.fxSmoke.mesh);
    this.scene.add(this.fxAlpha.mesh);
    this.scene.add(this.fxAdd.mesh);
    this.scene.add(this.bossTele.group);
    this.popupLayer = new PopupLayer(this.fx.popups);
    this.scene.add(this.popupLayer.mesh);
    window.addEventListener('keydown', (ev) => {
      if (ev.code === 'Enter' || ev.code === 'Escape' || ev.code === 'NumpadEnter') this.introSkipPending = true;
    });

    void preloadAllModels3D().then((res) => {
      this.modelsReady = res.loaded.length > 0;
      if (this.lastWorldRef) {
        this.rebuildActorInstances(this.lastWorldRef);
      } else if (this.builtLevelRef) {
        this.rebuildActorInstances({ level: this.builtLevelRef });
      }
    });
  }

  /** True between webglcontextlost and webglcontextrestored; render() is a no-op meanwhile. */
  public contextLost = false;
  public onContextChange: ((lost: boolean) => void) | null = null;
  /** Last frame's CPU milliseconds inside render(): particle/fx update, and the draw submission (composer or classic). */
  public readonly frameMs = { fx: 0, draw: 0 };

  /** Mirrors the HUD "Reduce flashing" option: damps shake and chromatic kick, steadies the low-HP tint. */
  public reduceMotion = false;
  private heroHurtAt = -10;
  private prevHurtTicks = 0;
  /** Display clock for particles and shake: 0 during hit-stop, <1 during kill slow-motion. */
  public fxTimeScale = 1;

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
    const r3 = (n: number): number => Math.round(n * 1000) / 1000;
    const enemyRender: Record<string, EnemyRenderTelemetry> = {};
    for (const [id, rig] of this.riggedEnemies) {
      const info = this.enemyRenderInfo.get(id);
      if (!info) continue;
      enemyRender[id] = {
        yaw: r3(info.yaw),
        clip: info.clip ?? rig.currentAnim,
        timeScale: r3(info.timeScale ?? 0),
        x: r3(info.x),
        y: r3(info.y),
        z: r3(info.z),
        poseState: info.poseState,
        blend: info.blend,
        footSpeed: info.footSpeed,
        headRel: info.headRel,
      };
    }
    for (const id of this.staticEnemies.keys()) {
      const info = this.enemyRenderInfo.get(id);
      if (!info) continue;
      enemyRender[id] = {
        yaw: r3(info.yaw),
        clip: info.clip ?? 'idle',
        timeScale: r3(info.timeScale ?? 0),
        x: r3(info.x),
        y: r3(info.y),
        z: r3(info.z),
        poseState: info.poseState,
      };
    }
    return {
      enemyStates,
      enemyRender,
      modelsLoaded: this.modelsReady,
      loadedModels: getLoadedModelNames3D(),
      failedModels: getFailedModelNames3D(),
      riggedCount: (this.operativeRig ? 1 : 0) + this.riggedEnemies.size,
      activeAnimations,
      drawCalls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
      perf: this.getPerfTelemetry(),
      vista: this.vista ? this.vista.telemetry() : { sector: null, visible: false, drawCalls: 0 },
      fx: this.fx.telemetry(),
      player: this.heroFrame && this.heroGear
        ? {
            weapon: this.heroFrame.shown,
            ...this.heroGear.telemetry(),
            poseState: this.heroFrame.state,
            recoil: r3(this.heroFrame.recoil),
            railFrac: r3(this.heroFrame.railFrac),
            swapping: this.heroFrame.swapping,
            lower: r3(this.heroFrame.lower),
            muzzle: { x: r3(this.heroMuzzle.x), y: r3(this.heroMuzzle.y), z: r3(this.heroMuzzle.z) },
            offsets: Object.fromEntries(Object.entries(this.heroFrame.offsets).map(([k, v]) => [k, r3(v)])),
          }
        : null,
      cinematic: {
        active: this.introLast.bars > 0,
        pan: r3(this.introPan),
        zoom: r3(this.introZoom),
        awake: r3(this.introAwake),
        title: r3(this.introLast.title),
        roared: this.introLast.roared,
      },
      bossFrame: { k: r3(this.bossFrameK), camZ: r3(this.camera.position.z), focusX: r3(this.camFocus.x) },
      camera: { x: r3(this.camera.position.x), y: r3(this.camera.position.y), z: r3(this.camera.position.z), fov: r3(this.camera.fov), roomClamp: this.camRoomClamp, zoomK: r3(this.camZoomK), playerScreenY: r3(this.camPlayerScreenY) },
    };
  }

  /**
   * Debug only: raycast from a CSS-pixel viewport point and list intersected meshes, nearest first.
   * Atmosphere Points (dust, spores) are skipped unless includePoints is set; Sprites are included.
   * Hits inside an enemy report `enemy: { enemyId, kind, state }`.
   */
  public pickAt(px: number, py: number, includePoints = false): Array<Record<string, unknown>> {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = this.pickNdc(((px - rect.left) / rect.width) * 2 - 1, -(((py - rect.top) / rect.height) * 2 - 1));
    const cam = this.activeCamera();
    cam.updateMatrixWorld();
    const rc = new THREE.Raycaster();
    rc.setFromCamera(ndc, cam);
    const hits = rc.intersectObjects(this.scene.children, true).filter((h) => includePoints || h.object.type !== 'Points');
    const hex = (c: unknown): string | null => (c instanceof THREE.Color ? `#${c.getHexString()}` : null);
    return hits.map((h) => {
      const o = h.object as THREE.Object3D & { material?: THREE.Material | THREE.Material[] };
      const m = (Array.isArray(o.material) ? o.material[0] : o.material) as THREE.Material & {
        color?: THREE.Color; emissive?: THREE.Color; opacity?: number; transparent?: boolean;
      };
      let named: THREE.Object3D | null = o;
      while (named && !named.name) named = named.parent;
      let enemyNode: THREE.Object3D | null = o;
      while (enemyNode && enemyNode.userData.enemyId === undefined) enemyNode = enemyNode.parent;
      const ud = enemyNode?.userData;
      return {
        name: enemyNode ? enemyNode.name : o.name || named?.name || '',
        type: o.type,
        userData: { ...o.userData, ...(named && named !== o ? { parentUserData: named.userData } : {}) },
        enemy: ud ? { enemyId: ud.enemyId, kind: ud.kind, state: ud.state } : null,
        materialType: m?.type ?? null,
        color: hex(m?.color),
        emissive: hex(m?.emissive),
        opacity: m?.opacity ?? null,
        transparent: m?.transparent ?? null,
        worldPos: { x: +h.point.x.toFixed(2), y: +h.point.y.toFixed(2), z: +h.point.z.toFixed(2) },
        distance: +h.distance.toFixed(2),
      };
    });
  }

  private activeCamera(): THREE.Camera {
    return this.viewMode === 'classic' ? this.orthoCamera : this.camera;
  }

  /** Classic View letterboxes to an integer scale, so canvas NDC is remapped into the picture. */
  private pickNdc(ndcX: number, ndcY: number): THREE.Vector2 {
    if (this.viewMode === 'classic' && this.classic) {
      const b = this.classic.bufferSize;
      const m = remapNdcToClassic(ndcX, ndcY, this.classic.currentLayout, b.w, b.h);
      return new THREE.Vector2(m.x, m.y);
    }
    return new THREE.Vector2(ndcX, ndcY);
  }

  public getViewMode(): ViewMode {
    return this.viewMode;
  }

  /** Classic: scale additive decor glow sprites (see CLASSIC_GLOW_SPRITE_SCALE); Modern restores the built opacity. */
  private applyClassicGlow(): void {
    const glow = this.scene.getObjectByName('decor:glow-sprite') as THREE.Mesh | undefined;
    const mat = glow?.material as THREE.MeshBasicMaterial | undefined;
    if (!mat) return;
    if (mat.userData.baseOpacity === undefined) mat.userData.baseOpacity = mat.opacity;
    const k = this.viewMode === 'classic' ? CLASSIC_GLOW_SPRITE_SCALE : 1;
    mat.opacity = (mat.userData.baseOpacity as number) * k;
    if (glow) glow.visible = k > 0;
  }

  /** Classic View: 320x200 palette-dithered render with an orthographic side camera. Bloom and the grade pass are bypassed. */
  public setViewMode(m: ViewMode): void {
    this.viewMode = m;
    this.mood?.setClassic(m === 'classic');
    this.vista?.setClassic(m === 'classic');
    this.hazards3d?.setClassic(m === 'classic');
    this.applyClassicGlow();
    if (m === 'classic' && !this.classic) this.classic = new ClassicPipeline(this.renderer);
    if (m === 'modern') {
      this.camera.aspect = this.renderer.domElement.width / this.renderer.domElement.height;
      this.camera.updateProjectionMatrix();
    }
  }

  public setCrt(on: boolean): void {
    this.crtOn = on;
  }

  /** Aligns the orthographic camera with the (shaken, zoomed) perspective camera pose. */
  private syncOrtho(): void {
    const lay = (this.classic as ClassicPipeline).refresh();
    const aspect = lay.w / lay.h;
    const zoom = (15.5 / Math.max(2, this.camera.position.z)) * (this.baseFov / this.camera.fov);
    const { halfW, halfH } = classicOrthoHalf(aspect, zoom);
    const o = this.orthoCamera;
    if (o.right !== halfW || o.top !== halfH) {
      o.left = -halfW;
      o.right = halfW;
      o.top = halfH;
      o.bottom = -halfH;
      o.updateProjectionMatrix();
    }
    if (Math.abs(this.camera.aspect - aspect) > 1e-4) {
      this.camera.aspect = aspect;
      this.camera.updateProjectionMatrix();
    }
    o.position.copy(this.camera.position);
    o.quaternion.copy(this.camera.quaternion);
    o.updateMatrixWorld();
  }

  /** Converts normalized canvas cursor coordinates (-1..1 NDC) into the world aim point on the z = 0 lane. */
  public screenToWorldAim(ndcX: number, ndcY: number, w: WorldState3D): { x: number; y: number; z: number } {
    const cam = this.activeCamera();
    cam.updateMatrixWorld();
    this.raycaster.setFromCamera(this.pickNdc(ndcX, ndcY), cam);
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
    if (this.builtLevelRef) this.teardownLevel();
    this.builtLevelRef = w.level;
    const sceneBefore = new Set<THREE.Object3D>(this.scene.children);

    const tex = getFacilityTextures3D();

    // Build static geometry: floors, walls, catwalks, ramps, pillars, acid pools
    this.rooms = w.level.rooms;
    this.secretDoorIds = new Set(w.level.secrets.map((sr) => sr.doorId));
    for (const s of w.level.solids) {
      if (s.dynamic) continue; // drawn by hazards3d / metroid3d (moves or toggles at runtime)
      this.addSolidMesh(s, tex);
    }
    this.flushSolidBatches(tex);
    this.buildDoorDressing(w.level.solids, tex);
    this.buildTrim();
    this.decor?.dispose();
    this.decor = buildDecor3D(this.scene, w.level, tex);
    this.vista?.dispose();
    this.vista = buildVista3D(this.scene, w.level);
    this.vista.setClassic(this.viewMode === 'classic');
    this.mood?.dispose();
    this.mood = buildMood3D(this.scene, w.level);
    this.hazards3d?.dispose();
    this.hazards3d = buildHazards3D(this.scene, w.level);
    this.metroid3d?.dispose();
    this.metroid3d = buildMetroid3D(this.scene, w.level);
    this.hazards3d.setClassic(this.viewMode === 'classic');
    this.mood.setClassic(this.viewMode === 'classic');
    this.applyClassicGlow();
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
      this.cullEntries.push({ obj: mesh, minX: r.minX, maxX: r.maxX, minY: Math.min(r.yMinEdge ?? 0, r.yMaxEdge) - 1, maxY: Math.max(r.yMinEdge ?? 0, r.yMaxEdge) + 1 });

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
      this.addCullPoint(mesh, p.x, p.minY + h * 0.5, p.radius + 0.5);

      // Glowing collar ring around blast pillar
      const ring = new THREE.Mesh(
        new THREE.CylinderGeometry(p.radius * 0.96, p.radius * 0.96, 0.14, 16),
        new THREE.MeshStandardMaterial({ color: 0xffaa33, emissive: 0xff9d2e, emissiveIntensity: 0.8 }),
      );
      ring.position.set(p.x, p.minY + 1.4, p.z);
      this.scene.add(ring);
      this.addCullPoint(ring, p.x, p.minY + 1.4, p.radius + 0.5);
    }

    for (const pool of w.level.acidPools) {
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(pool.maxX - pool.minX, pool.maxZ - pool.minZ),
        new THREE.MeshStandardMaterial({
          map: tex.acidMap,
          emissiveMap: tex.acidMap,
          color: 0x5f7a50,
          emissive: 0x6dff3a,
          emissiveIntensity: 0.16,
          roughness: 0.3,
        }),
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set((pool.minX + pool.maxX) * 0.5, pool.surfaceY, (pool.minZ + pool.maxZ) * 0.5);
      this.scene.add(mesh);
      this.acidMeshes.push(mesh);
      this.cullEntries.push({ obj: mesh, minX: pool.minX, maxX: pool.maxX, minY: pool.surfaceY - 1, maxY: pool.surfaceY + 1 });

      const acidLight = new THREE.PointLight(0x6dff3a, 1.1, 8, 1.8);
      acidLight.position.set(mesh.position.x, pool.surfaceY + 1.1, 0.5);
      this.scene.add(acidLight);
    }

    // Security Console holographic beacon
    this.consoleRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.65, 0.035, 8, 24),
      new THREE.MeshStandardMaterial({ color: 0x2bf0ff, emissive: 0x2bf0ff, emissiveIntensity: 0.6 }),
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
      this.addCullPoint(pad, st.x, st.y, 2);
      this.addCullPoint(padBase, st.x, st.y, 2);
      const machine = buildSaveStation();
      machine.group.position.set(st.x, st.y, 0.2);
      this.scene.add(machine.group);
      this.saveMachines.push(machine);
      this.addCullPoint(machine.group, st.x, st.y + 0.6, 3);
      const beam = new THREE.Mesh(
        new THREE.CylinderGeometry(0.75, 0.75, 2.4, 20, 1, true),
        new THREE.MeshBasicMaterial({ color: 0x2bf0ff, transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
      );
      beam.position.set(st.x, st.y + 1.3, 0.2);
      this.scene.add(beam);
      this.addCullPoint(beam, st.x, st.y + 1.3, 2);
    }

    // Upgrade pedestals: Thruster Boots (amber) and Energy Tanks (green)
    for (const up of w.level.upgrades) {
      const color = up.kind === 'thruster_boots' ? 0xffb02e : up.kind === 'crawl_slide' ? 0x2bf0ff : up.kind === 'ammo_expansion' ? 0xff8a2a : 0x3dff88;
      // Procedural item silhouette on the pedestal (boots / energy tank), spinning and bobbing in render().
      const gem = new THREE.Group();
      gem.add(
        up.kind === 'thruster_boots' ? buildBootsItem(color) : up.kind === 'crawl_slide' ? buildSlideItem(color) : up.kind === 'ammo_expansion' ? buildAmmoItem(color) : buildEnergyTankItem(color),
      );
      const halo = new THREE.Mesh(
        new THREE.CircleGeometry(0.6, 24),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.045, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
      );
      halo.position.z = -0.1;
      gem.add(halo);
      gem.position.set(up.x, up.y + 0.95, 0.2);
      this.scene.add(gem);
      this.upgradeMeshes.set(up.id, gem);
      this.addCullPoint(gem, up.x, up.y, 2);
      const base = new THREE.Mesh(
        new THREE.CylinderGeometry(0.55, 0.65, 0.2, 18),
        new THREE.MeshStandardMaterial({ color: 0x1b232c, emissive: color, emissiveIntensity: 0.2, metalness: 0.7, roughness: 0.5 }),
      );
      base.position.set(up.x, up.y + 0.1, 0.2);
      this.scene.add(base);
      this.addCullPoint(base, up.x, up.y, 2);
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.5, 0.03, 6, 24),
        new THREE.MeshStandardMaterial({ color: 0x1b232c, emissive: color, emissiveIntensity: 0.6 }),
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.set(up.x, up.y + 0.22, 0.2);
      this.scene.add(ring);
      this.addCullPoint(ring, up.x, up.y, 2);
    }

    // Everything added above is owned by this level; teardownLevel() removes and frees it when the level object changes.
    this.levelRoots = this.scene.children.filter((c) => !sceneBefore.has(c));
    this.rebuildActorInstances(w);
  }

  /** Static roots added by ensureWorldBuilt, and the per-batch texture clones that nothing else owns. */
  private levelRoots: THREE.Object3D[] = [];
  private levelTextures: THREE.Texture[] = [];

  /**
   * Frees every static mesh, material and cloned texture built for the previous Level3D, so replacing the level
   * (debug entry points, a new map) never stacks geometry. Shared facility textures and glTF geometry are not touched.
   */
  private teardownLevel(): void {
    this.decor?.dispose();
    this.decor = null;
    this.vista?.dispose();
    this.vista = null;
    this.frameRect.reset();
    this.mood?.dispose();
    this.mood = null;
    this.hazards3d?.dispose();
    this.hazards3d = null;
    this.metroid3d?.dispose();
    this.metroid3d = null;
    // Textures on level materials (tiled clones, cracked-wall canvases, shield maps) belong to the level unless they
    // are the shared facility atlas.
    const shared = new Set<unknown>(Object.values(getFacilityTextures3D()));
    const owned = new Set<THREE.Texture>(this.levelTextures);
    for (const root of this.levelRoots) {
      this.scene.remove(root);
      root.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        for (const x of Array.isArray(mat) ? mat : mat ? [mat] : []) {
          for (const v of Object.values(x as unknown as Record<string, unknown>)) if (v instanceof THREE.Texture && !shared.has(v)) owned.add(v);
          x.dispose();
        }
        if ((o as THREE.InstancedMesh).isInstancedMesh) (o as THREE.InstancedMesh).dispose();
      });
    }
    this.levelRoots = [];
    for (const t of owned) t.dispose();
    this.levelTextures = [];
    this.trimMesh = null;
    this.doorLamps = null;
    this.consoleRing = null;
    this.occludables.length = 0;
    this.cullEntries.length = 0;
    this.acidMeshes.length = 0;
    this.savePads.length = 0;
    this.saveMachines.length = 0;
    this.upgradeMeshes.clear();
    this.doorMeshes.clear();
    this.doorLampIdx.clear();
    this.pendingBatches.clear();
    this.trimSpecs.length = 0;
    this.logHolo?.dispose();
    this.logHolo = null;
    this.holoMats.length = 0;
    if (this.shieldMat) this.holoMats.push(this.shieldMat);
  }

  /** Frees geometry and materials of a subtree that only this renderer owns (never glTF-shared geometry). */
  private disposeTree(root: THREE.Object3D): void {
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) for (const x of mat) x.dispose();
      else mat?.dispose();
    });
  }

  private addSolidMesh(s: MapSolid3D, tex: ReturnType<typeof getFacilityTextures3D>): void {
    const sx = s.maxX - s.minX;
    const visualMaxY = s.visualMaxY ?? s.maxY;
    const sy = Math.max(0.08, visualMaxY - s.minY);
    // Crates fill the whole collision lane; render them shallower so they never wall off the camera view.
    const visMaxZ = s.kind === 'crate' ? Math.max(s.minZ + 0.4, Math.min(s.maxZ, -0.55)) : s.maxZ;
    const sz = visMaxZ - s.minZ;
    const cx = (s.minX + s.maxX) * 0.5;
    const cy = s.minY + sy * 0.5;
    const cz = (s.minZ + visMaxZ) * 0.5;

    const sector = this.sectorAt(cx, cy);
    const surf = SECTOR_SURFACE[sector];
    const info = classifySolid(s);
    if (!info.individual) {
      this.queueSolidBatch(s, info.cls, sector, { sx, sy, sz, cx, cy, cz });
      this.addSolidTrim(s, sx, sy, sz, cx, cy, sector);
      return;
    }
    let mat: THREE.MeshStandardMaterial;
    if (s.kind === 'catwalk' && s.minY >= 0.5) {
      const map = tex.grateMap.clone();
      map.repeat.set(Math.max(1, sx / 2), Math.max(1, sz / 2));
      map.needsUpdate = true;
      mat = new THREE.MeshStandardMaterial({ map, color: surf.grate, roughness: 0.42, metalness: 0.68 });
    } else if (s.kind === 'catwalk') {
      const base = surf.floor ? tex[surf.floor] : tex.deckMap;
      const map = base.clone();
      map.repeat.set(Math.max(1, sx / 4), Math.max(1, sz / 4));
      map.needsUpdate = true;
      if (surf.floor) {
        mat = new THREE.MeshStandardMaterial({ map, color: surf.tint, roughness: 0.6, metalness: 0.4 });
      } else {
        const bump = tex.deckBump.clone();
        bump.repeat.copy(map.repeat);
        bump.needsUpdate = true;
        mat = new THREE.MeshStandardMaterial({ map, bumpMap: bump, bumpScale: 0.04, roughness: 0.55, metalness: 0.45 });
      }
    } else if (s.kind === 'door' && s.doorId && this.secretDoorIds.has(s.doorId)) {
      const ct = makeCrackedWallTextures(Math.max(1, sx), Math.max(1, sy));
      mat = new THREE.MeshStandardMaterial({
        map: ct.color,
        emissiveMap: ct.glow,
        emissive: 0xffb02e,
        emissiveIntensity: 0.9,
        color: 0xb8aea0,
        roughness: 0.85,
        metalness: 0.2,
      });
      mat.userData.secret = true;
    } else if (s.kind === 'door') {
      const lockColor = s.doorLock ? DOOR_COLORS[s.doorLock] : 0xff4526;
      const map = tex.shieldMap.clone();
      map.repeat.set(1, Math.max(1, Math.round(sy / Math.max(0.4, sx))));
      map.needsUpdate = true;
      mat = new THREE.MeshStandardMaterial({
        map,
        color: 0x2c3038,
        emissive: lockColor,
        emissiveMap: map,
        emissiveIntensity: 0.9,
        roughness: 0.25,
        metalness: 0.6,
        transparent: true,
        opacity: 0.88,
      });
    } else if (s.kind === 'crate') {
      mat = new THREE.MeshStandardMaterial({
        map: tex.crateMap,
        color: 0xc8d2dc,
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
      const map = (surf.wall ? tex[surf.wall] : tex.wallMap).clone();
      map.repeat.set(Math.max(1, Math.max(sx, sz) / 4), Math.max(1, sy / 3));
      map.needsUpdate = true;
      mat = new THREE.MeshStandardMaterial({
        map,
        color: new THREE.Color(s.color ?? 0x8d9dad).multiply(new THREE.Color(surf.tint)),
        roughness: 0.52,
        metalness: 0.58,
        transparent: Boolean(!s.visualMaxY && s.maxY > 2.5 && s.minZ > 0),
        opacity: 1,
      });
      applyFrontLift(mat, 0.34);
    }

    // Break tiling: per-solid texture offset derived from the solid id.
    if (mat.map && mat.map.image && s.kind !== 'door') {
      let hsh = 2166136261;
      for (let i = 0; i < s.id.length; i++) hsh = Math.imul(hsh ^ s.id.charCodeAt(i), 16777619);
      mat.map.offset.set(((hsh >>> 0) % 997) / 997, ((hsh >>> 8) % 991) / 991);
    }
    this.addSolidTrim(s, sx, sy, sz, cx, cy, sector);

    const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
    mesh.position.set(cx, cy, cz);
    mesh.name = `solid:${s.id}`;
    mesh.userData.pickKind = s.kind;
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

  private queueSolidBatch(
    s: MapSolid3D,
    cls: SolidClass,
    sector: SectorId3D,
    g: { sx: number; sy: number; sz: number; cx: number; cy: number; cz: number },
  ): void {
    const surf = SECTOR_SURFACE[sector];
    const tex = getFacilityTextures3D();
    let rx = 1;
    let ry = 1;
    let color = new THREE.Color(0xffffff);
    if (cls === 'grate') {
      rx = Math.max(1, g.sx / 2);
      ry = Math.max(1, g.sz / 2);
      color = new THREE.Color(surf.grate);
    } else if (cls === 'floor') {
      rx = Math.max(1, g.sx / 4);
      ry = Math.max(1, g.sz / 4);
      if (surf.floor) color = new THREE.Color(surf.tint);
    } else if (cls === 'crate') {
      rx = tex.crateMap.repeat.x;
      ry = tex.crateMap.repeat.y;
      color = new THREE.Color(0xc8d2dc);
    } else if (cls === 'console') {
      color = new THREE.Color(0x162b38);
    } else {
      rx = Math.max(1, Math.max(g.sx, g.sz) / 4);
      ry = Math.max(1, g.sy / 3);
      color = new THREE.Color(s.color ?? 0x8d9dad).multiply(new THREE.Color(surf.tint));
    }
    // Break tiling: per-solid texture offset derived from the solid id.
    let hsh = 2166136261;
    for (let i = 0; i < s.id.length; i++) hsh = Math.imul(hsh ^ s.id.charCodeAt(i), 16777619);
    const ox = ((hsh >>> 0) % 997) / 997;
    const oy = ((hsh >>> 8) % 991) / 991;
    const bk = batchKeyFor(sector, { cls, transparent: false, individual: false });
    let b = this.pendingBatches.get(bk.key);
    if (!b) {
      b = { sector, cls, items: [] };
      this.pendingBatches.set(bk.key, b);
    }
    b.items.push({ ...g, rx, ry, ox, oy, color });
  }

  private flushSolidBatches(tex: ReturnType<typeof getFacilityTextures3D>): void {
    const tiled = (src: THREE.Texture): THREE.Texture => {
      const t = src.clone();
      t.repeat.set(1, 1);
      t.offset.set(0, 0);
      t.needsUpdate = true;
      this.levelTextures.push(t);
      return t;
    };
    for (const [key, b] of this.pendingBatches) {
      const surf = SECTOR_SURFACE[b.sector];
      let mat: THREE.MeshStandardMaterial;
      if (b.cls === 'grate') {
        mat = new THREE.MeshStandardMaterial({ map: tiled(tex.grateMap), vertexColors: true, roughness: 0.42, metalness: 0.68 });
      } else if (b.cls === 'floor') {
        const map = tiled(surf.floor ? tex[surf.floor] : tex.deckMap);
        mat = surf.floor
          ? new THREE.MeshStandardMaterial({ map, vertexColors: true, roughness: 0.6, metalness: 0.4 })
          : new THREE.MeshStandardMaterial({ map, bumpMap: tiled(tex.deckBump), bumpScale: 0.04, vertexColors: true, roughness: 0.55, metalness: 0.45 });
      } else if (b.cls === 'crate') {
        mat = new THREE.MeshStandardMaterial({ map: tiled(tex.crateMap), vertexColors: true, roughness: 0.5, metalness: 0.55 });
        applyFrontLift(mat, 0.26);
      } else if (b.cls === 'console') {
        mat = new THREE.MeshStandardMaterial({ vertexColors: true, emissive: 0x1cb8d6, emissiveIntensity: 0.9, roughness: 0.3, metalness: 0.65 });
      } else {
        mat = new THREE.MeshStandardMaterial({ map: tiled(surf.wall ? tex[surf.wall] : tex.wallMap), vertexColors: true, roughness: 0.52, metalness: 0.58 });
        applyFrontLift(mat, 0.34);
      }
      const geo = buildBatchGeometry(b.items);
      if (!geo) continue;
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = `solid-batch:${key}`;
      mesh.userData.pickKind = b.cls;
      mesh.userData.sector = b.sector;
      mesh.castShadow = b.cls !== 'floor';
      mesh.receiveShadow = true;
      this.scene.add(mesh);
      const bb = geo.boundingBox!;
      this.cullEntries.push({ obj: mesh, minX: bb.min.x, maxX: bb.max.x, minY: bb.min.y, maxY: bb.max.y });
    }
    this.pendingBatches.clear();
  }

  private addCullPoint(obj: THREE.Object3D, x: number, y: number, r: number): void {
    this.cullEntries.push({ obj, minX: x - r, maxX: x + r, minY: y - r, maxY: y + r });
  }

  /** Render-only: hide static scenery, enemies and pickups outside the camera window (no sim reads). */
  private applyViewCulling(w: WorldState3D): void {
    const dist = this.camera.position.z + 3;
    const halfH = dist * Math.tan((this.camera.fov * Math.PI) / 360) + 4;
    const halfW = halfH * Math.max(1, this.camera.aspect);
    const vx0 = this.camFocus.x - halfW;
    const vx1 = this.camFocus.x + halfW;
    const vy0 = this.camFocus.y - halfH;
    const vy1 = this.camFocus.y + halfH;
    for (const c of this.cullEntries) c.obj.visible = c.maxX >= vx0 && c.minX <= vx1 && c.maxY >= vy0 && c.minY <= vy1;
    this.decor?.setView(vx0, vx1, vy0, vy1);
    this.vista?.setView(vx0, vx1, vy0, vy1);
    const out = (o: THREE.Object3D): boolean => {
      const p = o.position;
      return p.x < vx0 - 3 || p.x > vx1 + 3 || p.y < vy0 - 3 || p.y > vy1 + 3;
    };
    for (const rig of this.riggedEnemies.values()) if (out(rig.root)) rig.root.visible = false;
    for (const st of this.staticEnemies.values()) if (out(st.root)) st.root.visible = false;
    for (const b of this.barrelHandles.values()) if (out(b.root)) b.root.visible = false;
    for (const g of this.pickupHandles.values()) if (out(g)) g.visible = false;
    void w;
  }

  private getPerfTelemetry() {
    const info = this.renderer.info;
    let shadowCasters = 0;
    // Visible meshes by scene-root child (name prefix, else type) plus geometry type: where the draw calls come from.
    const byGroup: Record<string, number> = {};
    let sceneObjects = 0;
    this.scene.traverse(() => {
      sceneObjects++;
    });
    this.scene.traverseVisible((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      if (o.castShadow) shadowCasters++;
      let top: THREE.Object3D = o;
      while (top.parent && top.parent !== this.scene) top = top.parent;
      const key = `${top.name.split(':')[0] || top.type}/${m.geometry.type}`;
      byGroup[key] = (byGroup[key] ?? 0) + 1;
    });
    return {
      byGroup,
      sceneChildren: this.scene.children.length,
      sceneObjects,
      contextLost: this.contextLost,
      frameMs: { fx: Math.round(this.frameMs.fx * 100) / 100, draw: Math.round(this.frameMs.draw * 100) / 100 },
      drawCalls: info.render.calls,
      triangles: info.render.triangles,
      programs: info.programs?.length ?? 0,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      shadowCasters,
    };
  }

  private sectorAt(x: number, y: number): SectorId3D {
    for (const r of this.rooms) {
      if (x >= r.minX && x <= r.maxX && y >= r.minY - 0.5 && y <= r.maxY + 0.5) return r.sector;
    }
    return 'shaft';
  }

  /** Collects bevel lips, trusses, side panels, door frames and rivet rows as instanced trim boxes. */
  private addSolidTrim(s: MapSolid3D, sx: number, sy: number, _sz: number, cx: number, cy: number, sector: SectorId3D): void {
    const top = s.minY + sy;
    const front = s.maxZ;
    const cap = 3200;
    const look = SECTOR_LOOK[sector];
    const push = (x: number, y: number, z: number, w: number, h: number, d: number, color: number, rz?: number): void => {
      if (this.trimSpecs.length < cap) this.trimSpecs.push({ x, y, z, sx: w, sy: h, sz: d, color, rz });
    };
    let hsh = 2166136261;
    for (let i = 0; i < s.id.length; i++) hsh = Math.imul(hsh ^ s.id.charCodeAt(i), 16777619);
    hsh >>>= 0;
    if (s.kind === 'catwalk' || s.kind === 'platform') {
      // Beveled edge: bright top lip plus a chamfer strip on the front face.
      push(cx, top + 0.02, front - 0.12, sx, 0.04, 0.24, look.lip);
      push(cx, top - 0.04, front + 0.01, sx, 0.05, 0.05, look.lip);
      push(cx, s.minY + 0.03, front + 0.01, sx, 0.06, 0.06, look.flange);
      // Side panels with per-sector variation and rivets.
      let pi = 0;
      for (let x = s.minX + 0.15; x < s.maxX - 0.3; x += 1.5) {
        const pw = Math.min(1.4, s.maxX - 0.15 - x);
        if (pw < 0.5) break;
        const color = look.plates[(pi + hsh) % look.plates.length];
        push(x + pw / 2, s.minY + sy * 0.5, front + 0.012, pw - 0.06, Math.max(0.06, sy * 0.58), 0.03, color);
        push(x + 0.08, s.minY + sy * 0.5, front + 0.03, 0.05, 0.05, 0.03, look.rivet);
        push(x + pw - 0.08, s.minY + sy * 0.5, front + 0.03, 0.05, 0.05, 0.03, look.rivet);
        pi++;
      }
      push(s.minX + 0.06, cy, front + 0.02, 0.12, sy + 0.04, 0.1, look.flange);
      push(s.maxX - 0.06, cy, front + 0.02, 0.12, sy + 0.04, 0.1, look.flange);
      if (s.minY >= 0.5) {
        const th = 0.55;
        // Hang the truss behind the character lane (z < 0) so it never covers the operative or enemies below.
        const zt = s.minZ + 0.25;
        const wood = sector === 'mines';
        const memberColor = wood ? look.brace : look.flange;
        const seg = wood ? 3 : 1.6;
        push(cx, s.minY - th, zt, sx, 0.08, 0.1, memberColor);
        let k = 0;
        for (let x = s.minX + 0.3; x < s.maxX - 0.3; x += seg, k++) {
          const w = Math.min(seg, s.maxX - 0.3 - x);
          if (w < 0.6) break;
          push(x, s.minY - th / 2, zt, wood ? 0.16 : 0.08, th, wood ? 0.16 : 0.1, memberColor);
          const len = Math.hypot(w, th);
          push(x + w / 2, s.minY - th / 2, zt, len, wood ? 0.1 : 0.06, 0.08, memberColor, (k % 2 === 0 ? 1 : -1) * Math.atan2(th, w));
        }
        if (sector === 'core') push(cx, s.minY - 0.2, front - 0.1, sx, 0.1, 0.1, look.brace);
        if (sector === 'biolabs') {
          // Glass-rail frame at the back of the deck (never in the character lane).
          push(cx, top + 0.9, s.minZ + 0.1, sx, 0.05, 0.05, look.lip);
          for (let x = s.minX + 0.3; x < s.maxX - 0.2; x += 2) push(x, top + 0.45, s.minZ + 0.1, 0.05, 0.9, 0.05, look.rivet);
        }
      }
    } else if (s.kind === 'door') {
      const j = 0.4;
      const zf = front + 0.08;
      // Heavy frame: jambs, inner bevels, lintel and plinth.
      push(s.minX - j / 2, cy, zf, j, sy + 0.5, 0.16, 0x3a4350);
      push(s.maxX + j / 2, cy, zf, j, sy + 0.5, 0.16, 0x3a4350);
      push(s.minX - 0.04, cy, zf + 0.06, 0.07, sy + 0.1, 0.06, 0x7a8898);
      push(s.maxX + 0.04, cy, zf + 0.06, 0.07, sy + 0.1, 0.06, 0x7a8898);
      push(cx, top + 0.25, zf, sx + 2 * j, 0.5, 0.16, 0x2c333d);
      push(cx, top + 0.02, zf + 0.06, sx + 0.1, 0.06, 0.06, 0x7a8898);
      push(cx, s.minY - 0.1, zf, sx + 2 * j, 0.2, 0.16, 0x2c333d);
    } else if (s.kind === 'wall' && sx >= 3 && sy >= 0.8) {
      // Floor slabs and walls: lit top lip, base plinth, panel seams and rivets.
      push(cx, top - 0.02, front - 0.12, sx, 0.05, 0.24, look.lip);
      if (sx >= 4 && sy >= 3) {
        push(cx, s.minY + 0.2, front + 0.03, sx, 0.4, 0.08, look.flange);
        if (sy <= 14) push(cx, top - 0.15, front + 0.03, sx, 0.3, 0.08, look.flange);
        for (let x = s.minX + 1; x < s.maxX - 0.5; x += 2) push(x, cy, front + 0.02, 0.1, 0.1, 0.06, 0x56626f);
        for (let x = s.minX + 2; x < s.maxX - 0.5; x += 4) push(x, cy, front + 0.015, 0.05, sy - 0.8, 0.04, look.plates[((x / 4) | 0) % look.plates.length]);
      }
    }
  }

  /** Door lock lamps, emitter bars, sign plates and hazard stripes as shared (instanced / merged) meshes. */
  private buildDoorDressing(solids: readonly MapSolid3D[], tex: ReturnType<typeof getFacilityTextures3D>): void {
    this.doorLampIdx.clear();
    const dress = buildDoorDressingMeshes(solids, tex, DOOR_COLORS);
    if (!dress) return;
    for (const [id, v] of dress.lampIdx) this.doorLampIdx.set(id, v);
    this.scene.add(dress.lamps);
    this.scene.add(dress.signs);
    this.doorLamps = dress.lamps;
    if (dress.hazard) this.scene.add(dress.hazard);
  }

  private buildTrim(): void {
    const n = this.trimSpecs.length;
    if (n === 0) return;
    if (this.trimMesh) {
      this.scene.remove(this.trimMesh);
      this.trimMesh.geometry.dispose();
      (this.trimMesh.material as THREE.Material).dispose();
      this.trimMesh.dispose();
    }
    const im = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55, metalness: 0.6 }),
      n,
    );
    im.name = 'trim:instanced';
    this.trimMesh = im;
    const d = new THREE.Object3D();
    const c = new THREE.Color();
    this.trimSpecs.forEach((t, i) => {
      d.position.set(t.x, t.y, t.z);
      d.rotation.set(0, 0, t.rz ?? 0);
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
    // Clear existing model nodes cleanly on model load finish. Cloned materials are ours to free; geometry is shared with the glTF cache.
    const freeMats = (mats: readonly THREE.Material[] | undefined): void => {
      if (mats) for (const m of mats) m.dispose();
    };
    if (this.operativeRig) {
      this.scene.remove(this.operativeRig.root);
      freeMats(this.operativeRig.materials);
      if (this.heroGear) freeMats(this.heroGear.materials);
      this.operativeRig = null;
      this.heroGear = null;
      this.heroFrame = null;
      this.fx.muzzleWorld.valid = false;
    }
    for (const r of this.riggedEnemies.values()) {
      this.scene.remove(r.root);
      freeMats(r.materials);
      r.root.traverse((o) => {
        if ((o as THREE.Mesh).name.startsWith('enemy-proxy:')) (o as THREE.Mesh).geometry.dispose();
      });
    }
    this.riggedEnemies.clear();
    for (const st of this.staticEnemies.values()) {
      this.scene.remove(st.root);
      freeMats(st.materials);
    }
    this.staticEnemies.clear();
    this.enemyViz.clear();
    this.enemyRenderInfo.clear();
    for (const b of this.barrelHandles.values()) {
      this.scene.remove(b.root);
      freeMats(b.materials);
    }
    this.barrelHandles.clear();
    for (const h of this.hiveHandles.values()) {
      this.scene.remove(h.root);
      this.disposeTree(h.root);
    }
    this.hiveHandles.clear();
    if (this.coreModel) {
      this.scene.remove(this.coreModel);
      this.coreModel = null;
    }
    if (this.coreShield) {
      this.scene.remove(this.coreShield);
      this.coreShield.geometry.dispose();
      this.coreShield = null;
    }
    if (this.exitModel) {
      this.scene.remove(this.exitModel);
      this.exitModel = null;
    }
    if (this.exitPortalRing) {
      this.scene.remove(this.exitPortalRing);
      this.disposeTree(this.exitPortalRing);
      this.exitPortalRing = null;
    }
    for (const pk of this.pickupHandles.values()) {
      this.scene.remove(pk);
      this.disposeTree(pk);
    }
    this.pickupHandles.clear();

    // Operative with attached Pulse Rifle on RightHand
    this.operativeRig = instantiateRiggedModel3D('operative', 1.82, true);
    this.scene.add(this.operativeRig.root);
    // Weapon models, headlamp lens and HP pack (meshes only). A cool fresnel rim keeps the silhouette readable in
    // the darker R3 mood without adding lights.
    this.heroGear = this.operativeRig.riflePivot ? new HeroGear(this.operativeRig) : null;
    this.heroCtl.reset(1);
    applyEnemyRim3D(this.operativeRig.materials, 0x8fdcff, 0.42, 0.06);
    if (this.heroGear) applyEnemyRim3D(this.heroGear.materials, 0x8fdcff, 0.3, 0.04);

    // Enemies
    const enemySpecs = 'enemies' in w && w.enemies ? w.enemies : w.level.enemies;
    for (const e of enemySpecs) {
      if (e.kind === 'warden' || e.kind === 'stalker') {
        const rig = instantiateRiggedModel3D(
          e.kind === 'warden' ? 'warden' : 'bio-stalker',
          e.kind === 'warden' ? 3.15 : STALKER_HEIGHT_3D,
          false,
        );
        rig.root.position.set(e.x, e.y, e.z);
        rig.root.rotation.order = 'YXZ';
        if (e.kind === 'warden') {
          tuneWardenMaterials3D(rig.materials, rig.baseEmissive);
          applyEnemyRim3D(rig.materials, ENEMY_RIM_3D[e.kind], 0.14, 0.0);
        } else {
          tuneEnemyMaterials3D(rig.materials, rig.baseEmissive, ENEMY_TINT_3D[e.kind]);
          applyEnemyRim3D(rig.materials, ENEMY_RIM_3D[e.kind], 0.6, 0.18);
        }
        const bodyH = e.kind === 'warden' ? 3.15 : STALKER_HEIGHT_3D;
        const bodyW = e.kind === 'warden' ? 1.8 : 0.9;
        // Invisible pick proxy: skinned meshes can miss raycasts, the box keeps enemies pickable
        const proxy = new THREE.Mesh(new THREE.BoxGeometry(bodyW, bodyH, bodyW), this.pickProxyMaterial);
        proxy.name = `enemy-proxy:${e.id}`;
        proxy.visible = false;
        proxy.position.y = bodyH / 2;
        rig.root.add(proxy);
        rig.root.name = `enemy:${e.id}`;
        rig.root.userData = { enemyId: e.id, kind: e.kind, state: 'dormant' };
        this.scene.add(rig.root);
        this.riggedEnemies.set(e.id, rig);
      } else {
        const key = e.kind === 'spitter' ? 'spitter' : 'crawler';
        const h = e.kind === 'spitter' ? 1.5 : 0.95;
        const st = instantiateStaticModel3D(key, h, true);
        st.root.position.set(e.x, e.y, e.z);
        st.root.rotation.order = 'YXZ';
        tuneEnemyMaterials3D(st.materials, st.baseEmissive, ENEMY_TINT_3D[e.kind]);
        applyEnemyRim3D(st.materials, ENEMY_RIM_3D[e.kind], 0.55, 0.16);
        st.root.name = `enemy:${e.id}`;
        st.root.userData = { enemyId: e.id, kind: e.kind, state: 'dormant' };
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

    // Hive nests: lumpy organic mound with glowing brood sacs (primitive meshes, no new assets)
    for (const h of 'hives' in w && w.hives ? w.hives : []) {
      const g = new THREE.Group();
      g.name = `hive:${h.id}`;
      const mat = new THREE.MeshStandardMaterial({ color: 0x3a2a22, roughness: 0.9, emissive: 0x1a3a10, emissiveIntensity: 0.6 });
      const mound = new THREE.Mesh(new THREE.IcosahedronGeometry(1.0, 1), mat);
      mound.scale.set(1.15, 0.85, 0.95);
      mound.position.y = 0.75;
      g.add(mound);
      const sacMat = new THREE.MeshStandardMaterial({ color: 0x9cff3a, emissive: 0x6cff20, emissiveIntensity: 1.4, roughness: 0.4, transparent: true, opacity: 0.9 });
      for (let i = 0; i < 5; i++) {
        const sac = new THREE.Mesh(new THREE.SphereGeometry(0.22 + (i % 3) * 0.05, 10, 8), sacMat);
        sac.position.set(-0.7 + i * 0.35, 0.55 + ((i * 37) % 5) * 0.14, 0.55);
        g.add(sac);
      }
      const spire = new THREE.Mesh(new THREE.ConeGeometry(0.28, 1.1, 7), mat);
      spire.position.set(0.1, 1.45, 0);
      g.add(spire);
      mergeStaticChildren(g, new Set([mound]));
      g.position.set(h.x, h.y, 0);
      this.scene.add(g);
      this.hiveHandles.set(h.id, { root: g, core: mound, mat: sacMat });
    }

    // Power Core & Forcefield Shield
    const core = instantiateStaticModel3D('power-core', 3.1, true);
    core.root.position.set(w.level.corePos.x, w.level.corePos.y, w.level.corePos.z);
    this.coreModel = core.root;
    this.scene.add(this.coreModel);

    if (!this.shieldMat) {
      this.shieldMat = createShieldMaterial(0x2bf0ff);
      this.holoMats.push(this.shieldMat);
    }
    const shieldMat = this.shieldMat;
    this.coreShield = new THREE.Mesh(new THREE.SphereGeometry(2.15, 36, 24), shieldMat);
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

  private getOrCreatePickupGroup(id: string, kind: 'med' | 'ammo' | 'weapon' | 'log', weapon?: WeaponSlot3D): THREE.Group {
    const existing = this.pickupHandles.get(id);
    if (existing) return existing;
    const grp = new THREE.Group();
    const color =
      kind === 'log' ? 0xc9a8ff : kind === 'med' ? 0x3dff88 : kind === 'ammo' ? 0xf5b942 : weapon === 6 ? 0xffc23a : weapon === 5 ? 0xff5a14 : weapon === 4 ? 0xd946ef : weapon === 3 ? 0xff7b2f : 0x2bf0ff;

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
      if (kind === 'log') {
        // Hologram: counter-rotating wire frame inside a projection cone (children[2], [3]; animated in render()).
        if (!this.logHolo) {
          this.logHolo = createHoloMaterial(0xc9a8ff);
          this.holoMats.push(this.logHolo);
        }
        const wire = new THREE.Mesh(new THREE.OctahedronGeometry(0.5, 0), this.logHolo);
        wire.position.y = 0.65;
        const cone = new THREE.Mesh(
          new THREE.ConeGeometry(0.62, 1.2, 14, 1, true),
          new THREE.MeshBasicMaterial({ color: 0x9a6bff, transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
        );
        cone.rotation.x = Math.PI;
        cone.position.y = 0.62;
        grp.add(wire, cone);
      }
    }

    grp.name = `pickup:${id}`;
    this.scene.add(grp);
    this.pickupHandles.set(id, grp);
    return grp;
  }

  /** Title attract mode: pass elapsed seconds for a cinematic camera drift, or null to restore the follow camera. */
  public setAttractCamera(t: number | null, shot?: { dolly: number; sway: number; lift: number; lookDown: number }): void {
    this.attractT = t;
    this.attractShot = shot ?? null;
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
    if (this.contextLost) return;
    const now = performance.now();
    const dt = Math.min(0.05, Math.max(0.001, (now - this.lastRenderMs) / 1000));
    this.lastRenderMs = now;
    const tSec = now * 0.001;
    const a = Math.max(0, Math.min(1, alpha));

    this.ensureWorldBuilt(w);
    this.captureTick(w);

    // 0. Core Warden intro: skip request, display-side timeline, overlay (the simulation holds boss and player itself)
    const introActive = w.bossIntroTicks > 0;
    if (introActive && (this.attractT !== null || this.introSkipPending)) skipBossIntro3D(w);
    this.introSkipPending = false;
    const introOn = introActive && this.attractT === null;
    this.introDisplayTicks = nextIntroDisplayTicks(this.introDisplayTicks, this.introSimTicks, w.bossIntroTicks, dt);
    this.introSimTicks = w.bossIntroTicks;
    const intro = introOn ? introState(this.introDisplayTicks) : introState(0);
    {
      const ik = Math.min(1, dt * (introOn ? 10 : 7));
      this.introPan += (intro.pan - this.introPan) * ik;
      this.introZoom += (intro.zoom - this.introZoom) * ik;
      this.introAwake += (intro.awake - this.introAwake) * ik;
      this.introLast = intro;
      this.introOverlay.apply(intro, introOn);
      const wdIntro = w.enemies.find((e) => e.kind === 'warden' && !e.minion);
      if (introOn && intro.roared && !this.introRoared && wdIntro) {
        this.introRoared = true;
        this.fx.bossRoar(wdIntro.x, wdIntro.y + wdIntro.height * 0.55);
      }
      if (!introOn) this.introRoared = false;
    }

    // 1. Locks: colored energy shields slide away once opened
    for (const [id, entry] of this.doorMeshes) {
      const open = w.openDoors.has(id);
      const targetY = open ? entry.baseY + entry.height + 0.3 : entry.baseY;
      entry.mesh.position.y += (targetY - entry.mesh.position.y) * Math.min(1, dt * 8);
      const mat = entry.mesh.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = mat.userData.secret ? (open ? 0.1 : 0.55 + Math.sin(tSec * 2.2 + entry.baseY) * 0.35) : open ? 0.15 : 0.5 + Math.sin(tSec * 3 + entry.baseY) * 0.15;
      entry.mesh.visible = !open || Math.abs(entry.mesh.position.y - targetY) > 0.05;
      if (mat.map && !mat.userData.secret) {
        mat.map.offset.y = (tSec * 0.18) % 1;
        mat.map.offset.x = Math.sin(tSec * 0.7 + entry.baseY) * 0.03;
      }
      const lamp = this.doorLampIdx.get(id);
      if (lamp && this.doorLamps && lamp.open !== open) {
        lamp.open = open;
        const dim = new THREE.Color(open ? 0x1f5a2a : lamp.color);
        for (const i of lamp.idx) this.doorLamps.setColorAt(i, dim);
        if (this.doorLamps.instanceColor) this.doorLamps.instanceColor.needsUpdate = true;
      }
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
    for (const m of this.saveMachines) {
      m.screen.emissiveIntensity = 0.75 + Math.sin(tSec * 3.1) * 0.2;
      m.rings.forEach((r, i) => {
        r.rotation.z = tSec * (i === 0 ? 1.4 : -1.9);
        r.position.y = 0.6 + i * 0.55 + Math.sin(tSec * 2 + i) * 0.06;
      });
    }
    for (const hm of this.holoMats) hm.uniforms.uT.value = tSec;
    for (const [id, gem] of this.upgradeMeshes) {
      gem.visible = !w.collectedUpgrades.has(id);
      gem.rotation.y = tSec * 2.0;
      gem.position.y = (w.level.upgrades.find((u) => u.id === id)?.y ?? 0) + 0.95 + Math.sin(tSec * 3 + gem.position.x) * 0.12;
    }

    // 3. Sector ambience and Meltdown lighting
    const room = w.level.rooms.find((r) => r.sector === w.currentRoom);
    const inMeltdown = w.coreDestroyed && w.meltdownTicks >= 0;
    const bg = new THREE.Color(room ? room.ambientColor : 0x090e14).multiplyScalar(0.28);
    const sirenPulse = this.reduceMotion ? 0.6 : 0.5 + 0.5 * Math.sin(tSec * 6.2);
    if (inMeltdown) bg.lerp(_MELT_BG, 0.25 + 0.3 * sirenPulse);
    (this.scene.background as THREE.Color).lerp(bg, Math.min(1, dt * 3));
    (this.scene.fog as THREE.FogExp2).color.copy(this.scene.background as THREE.Color);
    const fogTarget = Math.min(0.02, room ? SECTOR_FOG[room.sector] : 0.012);
    this.fogDensity += (fogTarget - this.fogDensity) * Math.min(1, dt * 2);
    (this.scene.fog as THREE.FogExp2).density = this.fogDensity;
    this.decor?.update(tSec, w.player.body.x, w.player.body.y, this.reduceMotion);
    this.vista?.update(tSec, { playerX: w.player.body.x, playerY: w.player.body.y, reduce: this.reduceMotion, meltdown: inMeltdown });
    this.mood?.update(tSec, this.reduceMotion);
    this.hazards3d?.update(w, tSec, dt, this.fx.smoke, this.reduceMotion);
    this.metroid3d?.update(w, tSec, dt, this.reduceMotion);
    const preset = SECTOR_LIGHT[room ? room.sector : 'airlock'];
    const lk = Math.min(1, dt * 2.5);
    this.presetSky.lerp(preset.sky, lk);
    this.presetSun.lerp(preset.sun, lk);
    this.presetAmbI += (preset.ambient - this.presetAmbI) * lk;
    this.presetSunI += (preset.sunI - this.presetSunI) * lk;
    this.bloomPass.strength += (preset.bloom - this.bloomPass.strength) * lk;
    this.lampK += ((w.light.on ? 1 : 0) - this.lampK) * Math.min(1, dt * 6);
    const dim = LAMP_OFF_DIM + (1 - LAMP_OFF_DIM) * this.lampK;
    const reactor = !inMeltdown && room && room.sector === 'core' ? 0.86 + 0.28 * reactorPulse(tSec, this.reduceMotion) : 1;
    this.ambient.intensity = this.presetAmbI * dim * reactor;
    this.sun.intensity = this.presetSunI * dim;
    this.sun.color.copy(this.presetSun);
    if (inMeltdown) {
      const pulse = 0.5 + 0.5 * Math.sin(tSec * 8.5);
      this.alarmLight.intensity = 14 + pulse * 18;
      // Rotating beacon: the existing alarm light orbits the operative so walls sweep red (no extra lights).
      const sweep = this.reduceMotion ? 0 : tSec * 2.6;
      this.alarmLight.position.set(w.player.body.x + Math.cos(sweep) * 9, w.player.body.y + 3.4 + Math.sin(sweep * 0.5) * 1.2, 3.5 + Math.sin(sweep) * 2.5);
      this.ambient.color.setHex(0xc96b6b).lerp(_MELT_RED, 0.25 + 0.35 * sirenPulse);
      this.ambient.intensity *= 0.85 + 0.35 * sirenPulse;
    } else {
      this.alarmLight.intensity = 0;
      this.ambient.color.copy(this.presetSky);
    }
    if (this.fx.envPulse > 0.001) {
      const pc = BOSS_PHASE_COLORS[this.fx.bossPhase - 1];
      this.ambient.color.lerp(_PHASE_TMP.setRGB(pc[0], pc[1], pc[2]), this.fx.envPulse * 0.55);
      this.ambient.intensity += this.fx.envPulse * 1.2;
      this.sun.intensity += this.fx.envPulse * 1.2;
    }
    if (typeof document !== 'undefined') {
      document.body.classList.toggle('meltdown-alert', inMeltdown);
      document.body.classList.toggle('meltdown-calm', this.reduceMotion);
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
      // Crawl Slide: squash the operative to a crouch while the body is low (visual only)
      const baseSy = (rig.root.userData.baseScaleY ??= rig.root.scale.y) as number;
      this.slideSquash += ((pb.sliding ? 1 : 0) - this.slideSquash) * Math.min(1, dt * 18);
      rig.root.scale.y = baseSy * (1 - 0.42 * this.slideSquash);
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

      const heroFrame = this.heroCtl.step(dt, {
        hp: p.hp,
        maxHp: p.maxHp,
        weapon: p.weapon,
        muzzleFlashTicks: p.muzzleFlashTicks,
        hurtFlashTicks: p.hurtFlashTicks,
        railCharge: p.railCharge,
        railChargeMax: RAIL_CHARGE_TICKS,
        airborne,
        vx: pb.vx,
        vy: pb.vy,
        aimSignX: pose.aimSignX,
        landingFactor: pose.landingFactor,
        dashTicks: pb.dashTicks,
        wallDir: pb.wallDir,
        wallJumpLock: pb.wallJumpLock,
        stomping: pb.stomping,
        saveCooldown: w.saveCooldown,
        tick: w.tick,
      });
      this.heroFrame = heroFrame;
      stepRiggedAnimation3D(rig, desiredAnim, dt, 1.08, 0, p.hp > 0, { ...pose, grounded: pose.grounded || !airborne }, {
        frame: heroFrame,
        tSec,
        wallDir: pb.wallDir,
      });
      rig.root.updateMatrixWorld(true);
      this.heroGear?.update(tSec, heroFrame, this.lampK);

      // Classic: the suit is lit to only a few percent in dark rooms, so any emissive tint (red hurt flash 0.35 after the
      // clamp, even a 0.14 teal lift) outweighs the diffuse texture and the palette pass maps the whole body to one entry
      // (the solid red silhouette while the world was paused mid-flash). Classic keeps emissive off and shows the hurt
      // through the palette pass damage flash, plus a short visibility blink like a 90s sprite.
      const cl = this.viewMode === 'classic';
      // Hurt flash decays on display time: a new hit (counter rises) restarts it, a paused sim cannot hold it.
      if (p.hurtFlashTicks > this.prevHurtTicks) this.heroHurtAt = tSec;
      this.prevHurtTicks = p.hurtFlashTicks;
      const hurtAmt = p.hurtFlashTicks > 0 ? playerHurtFlashAmount(tSec - this.heroHurtAt, this.reduceMotion) : 0;
      // Blink on wall-clock time (15 Hz) so a paused world never freezes on a hidden frame.
      rig.root.visible = !(cl && p.hurtFlashTicks > 0 && Math.floor(tSec * 15) % 2 === 1);
      if (cl) flashRiggedMaterials3D(rig, 0x000000, 0);
      else if (hurtAmt > 0) flashRiggedMaterials3D(rig, HIT_FLASH_HEX, hurtAmt);
      else if (p.dashInvulnTicks > 0) flashRiggedMaterials3D(rig, 0x2bf0ff, 0.55);
      else flashRiggedMaterials3D(rig, 0x000000, 0);

      const muzzlePos = new THREE.Vector3();
      const muzzleObj = this.heroGear?.activeMuzzle() ?? rig.muzzleLocal;
      if (muzzleObj) muzzleObj.getWorldPosition(muzzlePos);
      else muzzlePos.set(px + pose.aimDirX * 0.85, py + 1.15 + pose.aimDirY * 0.85, 0.2);

      const posAttr = this.laserGeom.attributes.position as THREE.BufferAttribute;
      posAttr.setXYZ(0, muzzlePos.x, muzzlePos.y, muzzlePos.z);
      posAttr.setXYZ(1, p.aimX, p.aimY, 0.2);
      posAttr.needsUpdate = true;

      // Hand the rendered muzzle socket to the FX director so flashes and beam origins sit on the barrel
      this.heroMuzzle.x = muzzlePos.x;
      this.heroMuzzle.y = muzzlePos.y;
      this.heroMuzzle.z = muzzlePos.z;
      this.fx.muzzleWorld.x = muzzlePos.x;
      this.fx.muzzleWorld.y = muzzlePos.y;
      this.fx.muzzleWorld.valid = p.hp > 0;

      this.reticleGroup.position.set(p.aimX, p.aimY, 0.3);
      this.reticleGroup.rotation.z = tSec * 3.2;

      this.fillLight.position.set(px, py + 1.8, 4.2);
      // Classic: the palette pass crushes the dim suit to near-black grey; a stronger, cooler fill keeps the teal and grey
      // armour panels on distinct palette ramps (same light, no extra PointLight).
      this.fillLight.intensity = cl ? 26 : 11;
      this.fillLight.color.setHex(cl ? 0x9fe8ff : 0xbfe6ff);
      this.muzzleLight.intensity = p.muzzleFlashTicks > 0 ? 14 : 0;
      this.muzzleLight.position.copy(muzzlePos);

      // R3.3 Headlamp (100% visual-only)
      this.headlamp.intensity = HEADLAMP_INTENSITY * this.lampK;
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
    let wardenE: WorldState3D['enemies'][number] | null = null;
    let wardenX = 0;
    let wardenY = 0;
    let decalIdx = 0;
    let glowIdx = 0;
    for (const e of w.enemies) {
      const pe = this.prevEnemies.get(e.id) ?? { x: e.x, y: e.y };
      const ce = this.curEnemies.get(e.id) ?? { x: e.x, y: e.y };
      const ex = Math.abs(ce.x - pe.x) > 4 ? ce.x : pe.x + (ce.x - pe.x) * a;
      const ey = Math.abs(ce.y - pe.y) > 4 ? ce.y : pe.y + (ce.y - pe.y) * a;
      this.lastEnemyStates.set(e.id, e.alive ? e.state : 'dead');
      if (e.kind === 'warden' && !e.minion) { wardenE = e; wardenX = ex; wardenY = ey; }

      let v = this.enemyViz.get(e.id);
      if (!v) {
        v = { yaw: e.yaw, lean: 0, recoil: 0, prevHit: 0, shot: 0, prevWindup: 0, phase: (e.x * 1.7) % 6.28, gait: 0, land: 0, stagger: 0, prevVy: 0, lodAcc: 0 };
        this.enemyViz.set(e.id, v);
      }
      // Smooth turn (rate ~7) with a lean into the turn
      const yawDiff = wrapAngle(e.yaw - v.yaw);
      v.yaw = stepEnemyYaw(v.yaw, e.yaw, dt, 7);
      const leanTarget = Math.max(-0.12, Math.min(0.12, yawDiff * 0.1));
      v.lean += (leanTarget - v.lean) * Math.min(1, dt * 10);
      if (e.hitFlashTicks > v.prevHit) v.recoil = 1;
      v.prevHit = e.hitFlashTicks;
      v.recoil = Math.max(0, v.recoil - dt * 6);
      if (v.prevWindup > 0 && e.windupTicks === 0 && e.alive) v.shot = 1;
      v.prevWindup = e.windupTicks;
      v.shot = Math.max(0, v.shot - dt * 5);
      v.stagger += ((e.alive && (e.state === 'stagger' || e.staggerTicks > 0) ? 1 : 0) - v.stagger) * Math.min(1, dt * 12);
      if (Math.abs(v.prevVy) > 2 && Math.abs(e.vy) < 0.3) v.land = 1;
      v.prevVy = e.vy;
      v.land = Math.max(0, v.land - dt * 7);

      const speed = Math.abs(e.vx);
      const windTotal = e.kind === 'warden' && e.phase >= 2 ? 28 : ENEMY_WINDUP_TOTAL_3D[e.kind];
      const winding = e.alive && (e.windupTicks > 0 || e.state === 'windup');
      const alerting = e.alive && e.state === 'alert';
      const striking = e.alive && !winding && (e.state === 'attack' || e.attackAnimTicks > 0);
      const windFrac = winding ? 1 - e.windupTicks / windTotal : 0;
      const popAmt = !e.alive && e.kind !== 'warden' ? deathPopAmount(e.deathTicks, this.reduceMotion) : 0;
      const flashAmt = popAmt > 0 ? popAmt : hitFlashAmount(e.hitFlashTicks, this.reduceMotion);
      const flashHex = popAmt > 0 ? 0xffffff : HIT_FLASH_HEX;
      const flashCap = popAmt > 0 ? DEATH_POP_CAP : undefined;

      const rig = this.riggedEnemies.get(e.id);
      if (rig) {
        rig.root.userData.state = e.alive ? e.state : 'dead';
        const rk = e.kind === 'warden' ? 'warden' : 'stalker';
        const driver = (v.rig ??= new EnemyRigDriver(rk, e));
        // LOD: far foes re-pose less often (the skinned update is the expensive part); state changes always step
        const dxp = ex - px;
        const dyp = ey - py;
        const far2 = dxp * dxp + dyp * dyp;
        const interval = e.kind === 'warden' ? 0 : far2 > 40 * 40 ? 1 / 12 : far2 > 24 * 24 ? 1 / 24 : 0;
        v.lodAcc += dt;
        const last = v.lastFrame;
        const changed = !last || (e.alive ? e.state : 'dead') !== (rig.root.userData.lastState as string | undefined);
        let frame = last;
        if (!frame || changed || v.lodAcc >= interval) {
          frame = driver.step(e, { x: px, y: py }, v.lodAcc, tSec, ex);
          stepEnemyRigAnimation3D(rig, rk, frame, v.lodAcc);
          applyEnemyRigChannels3D(rig, frame.ch);
          v.lodAcc = 0;
          v.lastFrame = frame;
          rig.root.userData.lastState = e.alive ? e.state : 'dead';
        }
        v.yaw = frame.bodyYaw;
        this.enemyRenderInfo.set(e.id, {
          yaw: v.yaw,
          x: ex,
          y: ey,
          z: 0,
          clip: frame.clip,
          timeScale: frame.timeScale,
          poseState: frame.poseState,
          blend: frame.weights as unknown as Record<string, number>,
          footSpeed: frame.footSpeed,
          headRel: frame.headRel,
        });
        let deathScale = 1;
        let deathSink = 0;
        if (!e.alive) {
          // The death clip falls; after it settles the body sinks and shrinks away instead of popping out
          const k = Math.max(0, Math.min(1, (e.deathTicks - 150) / 90));
          deathScale = 1 - k;
          deathSink = k * 0.25;
          rig.root.visible = e.deathTicks < 240;
        } else {
          rig.root.visible = true;
        }
        rig.root.position.set(ex, ey - deathSink, 0);
        rig.root.rotation.set(frame.rootPitch, v.yaw, v.lean);
        rig.root.scale.set(1, Math.max(0.001, frame.rootScaleY) * Math.max(0.001, deathScale), 1);
        rig.root.scale.x = rig.root.scale.z = Math.max(0.001, (1 + v.recoil * 0.05) * deathScale);
        if (flashAmt > 0) {
          flashRiggedMaterials3D(rig, flashHex, flashAmt, flashCap);
        } else if (e.kind === 'warden' && e.alive && !e.active && this.introAwake > 0.01) {
          flashRiggedMaterials3D(rig, BOSS_PHASE_HEX[0], WARDEN_FLASH_SCALE_3D * (0.05 + 0.4 * this.introAwake));
        } else if (e.kind === 'warden' && e.alive && e.exposedTicks > 0) {
          flashRiggedMaterials3D(rig, 0xffd24a, WARDEN_FLASH_SCALE_3D * (this.reduceMotion ? 0.4 : 0.4 + 0.16 * Math.sin(tSec * 16)));
        } else if (e.kind === 'warden' && winding) {
          flashRiggedMaterials3D(rig, e.bossPattern === 'summon' ? 0xa060ff : 0xff451f, WARDEN_FLASH_SCALE_3D * (0.12 + 0.2 * windFrac));
        } else if (e.kind === 'warden' && e.alive) {
          flashRiggedMaterials3D(rig, BOSS_PHASE_HEX[Math.min(3, e.phase) - 1], WARDEN_FLASH_SCALE_3D * (e.phase >= 2 ? 0.12 : 0.06));
        } else {
          flashRiggedMaterials3D(rig, 0x000000, 0);
        }
        if (e.kind === 'warden' && e.alive && e.windupTicks > 0) telegraphWarden = e;
      }

      const st = this.staticEnemies.get(e.id);
      if (st) {
        const r = st.root;
        r.userData.state = e.alive ? e.state : 'dead';
        // Wall/ceiling crawlers move along the surface (vy is crawl speed there, not a fall)
        const onSurface = e.surface !== 'floor' && !e.dropping;
        const surfSpeed = onSurface ? Math.hypot(e.vx, e.vy) : speed;
        const proc = proceduralEnemyPose({
          kind: e.kind === 'spitter' ? 'spitter' : 'crawler',
          alive: e.alive,
          speed: surfSpeed,
          vy: onSurface ? 0 : e.vy,
          winding,
          windFrac,
          striking,
          shot: v.shot,
          land: v.land,
          stagger: v.stagger,
          recoil: v.recoil,
          lean: v.lean,
          deathTicks: e.deathTicks,
          tSec,
          gait: v.gait,
          phase: v.phase,
          alerting,
        });
        if (e.alive) v.gait += dt * gaitStep(e.kind === 'spitter' ? 'spitter' : 'crawler', speed);
        const sec = (v.sec ??= new ProcSecondary(e.surfaceAngle));
        const sc = sec.step(
          {
            alive: e.alive,
            sx: proc.sx,
            sy: proc.sy,
            sz: proc.sz,
            pitch: proc.pitch,
            roll: proc.roll,
            vx: e.vx,
            dropping: e.dropping,
            shot: v.shot,
            surfaceTarget: e.surfaceAngle,
            spitter: e.kind === 'spitter',
          },
          dt,
        );
        const { lift, pitch, roll } = proc;
        const { sx, sy, sz } = sc;
        r.visible = proc.visible;
        const inner = r.children[0];
        if (inner) inner.rotation.set(sc.innerPitch, 0, sc.innerRoll);
        this.enemyRenderInfo.set(e.id, { yaw: v.yaw, x: ex, y: ey, z: 0, clip: proc.clip, timeScale: proc.timeScale, poseState: proc.clip });
        const pulse = e.alive ? 1 + v.recoil * 0.06 : 1;
        // Wall/ceiling crawling: rotate the body about the world Z axis around its box centre (sim exposes surfaceAngle)
        const sa = sc.surf;
        if (Math.abs(sa) > 1e-3) {
          const hh = e.height;
          r.position.set(ex + Math.sin(sa) * hh * 0.5, ey + hh * 0.5 - Math.cos(sa) * hh * 0.5 + lift, 0);
          r.rotation.set(pitch - (Math.sin(v.yaw) >= 0 ? 1 : -1) * sa, v.yaw, roll);
        } else {
          r.position.set(ex, ey + lift, 0);
          r.rotation.set(pitch, v.yaw, roll);
        }
        r.scale.set(sx * pulse, sy * pulse, sz * pulse);
        flashMaterials3D(st.materials, st.baseEmissive, flashHex, flashAmt, flashCap);
        if (e.alive && e.kind === 'spitter' && winding && glowIdx < this.muzzleGlows.length) {
          const g = this.muzzleGlows[glowIdx++];
          g.visible = true;
          g.position.set(ex + e.facing * 0.6, ey + 1.0 + lift, 0.25);
          g.scale.setScalar(0.08 + windFrac * 0.3);
        }
      }

      if (e.alive && winding && e.surface === 'floor' && (e.kind === 'crawler' || e.kind === 'stalker') && decalIdx < this.lungeDecals.length) {
        const d = this.lungeDecals[decalIdx++];
        const len = e.kind === 'crawler' ? 2.6 : 3.6;
        d.visible = true;
        d.name = `telegraph:${e.kind}`;
        d.position.set(ex + e.facing * len * 0.5, ey + 0.06, 0);
        d.scale.set(len * (0.5 + 0.5 * windFrac), 1, 1.4);
        (d.material as THREE.MeshBasicMaterial).opacity = 0.15 + 0.4 * windFrac;
      }
    }
    for (let i = decalIdx; i < this.lungeDecals.length; i++) this.lungeDecals[i].visible = false;
    for (let i = glowIdx; i < this.muzzleGlows.length; i++) this.muzzleGlows[i].visible = false;

    if (telegraphWarden && telegraphWarden.bossPattern === 'slam') {
      this.wardenTelegraphRing.visible = true;
      const pct = 1 - telegraphWarden.windupTicks / (telegraphWarden.phase >= 2 ? 28 : 36);
      this.wardenTelegraphRing.position.set(telegraphWarden.x, telegraphWarden.y + 0.1, 0);
      this.wardenTelegraphRing.scale.setScalar(1.2 + pct * 2.2);
    } else {
      this.wardenTelegraphRing.visible = false;
    }

    this.bossTele.update(w, wardenE, wardenX, wardenY, px, py, tSec, this.reduceMotion, this.introAwake, introOn);

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

    for (const h of w.hives) {
      const hh = this.hiveHandles.get(h.id);
      if (!hh) continue;
      hh.root.visible = h.alive;
      if (h.alive) {
        const pulse = 1 + (this.reduceMotion ? 0 : 0.03 * Math.sin(tSec * 3 + h.x)) + h.spawnFlashTicks * 0.012;
        hh.root.scale.set(pulse, pulse, pulse);
        hh.mat.emissiveIntensity = 1.2 + h.spawnFlashTicks * 0.1 + (h.hitFlashTicks > 0 ? 1.4 : 0);
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

    // Data logs reuse the pickup visual path (violet octahedron).
    for (let i = 0; i < w.collectibles.length; i++) {
      const lg = w.collectibles[i];
      const id = `datalog:${i}`;
      if (lg.taken) {
        const g = this.pickupHandles.get(id);
        if (g) g.visible = false;
        continue;
      }
      const g = this.getOrCreatePickupGroup(id, 'log');
      g.visible = true;
      g.position.set(lg.x, lg.y, 0.2);
      if (g.children[1]) {
        g.children[1].rotation.y = tSec * 2.1;
        g.children[1].position.y = 0.65 + Math.sin(tSec * 3.4 + i) * 0.12;
      }
      if (g.children[2] && g.children[3]) {
        g.children[2].rotation.y = -tSec * 1.3;
        g.children[2].rotation.x = tSec * 0.7;
        g.children[2].position.y = 0.65 + Math.sin(tSec * 3.4 + i) * 0.12;
        const flick = this.reduceMotion ? 0.16 : 0.12 + 0.07 * Math.sin(tSec * 23 + i * 5) * Math.sin(tSec * 7 + i);
        ((g.children[3] as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = flick;
        g.children[3].rotation.y = tSec * 0.8;
      }
    }

    // 7. Dynamic Projectiles, Shockwaves, Explosions & Rail Beams
    this.syncDynamicFX(w, dt);

    // 8. Side-view camera: smoothed look-ahead (aim + velocity), dead zone, per-room vertical clamp, trauma shake
    this.fx.reduce = this.reduceMotion;
    const fxT0 = performance.now();
    this.fx.update(dt * this.fxTimeScale, w);
    this.frameMs.fx = performance.now() - fxT0;
    // Vertical composition: the player sits at ~42% from the bottom (sector hint may lower it); room clamp comes after boss framing.
    const hint = sectorCameraHint(w.currentRoom);
    const anchorY = py + 0.9 + verticalFocusOffset(this.camHalfH, hint.screenY);
    this.fx.rig.update(dt, px, anchorY, p.body.vx, p.aimX - px, p.aimY - py, p.body.grounded);
    this.camFocus.set(this.fx.rig.fx, this.fx.rig.fy, 0);
    {
      const dists: number[] = [];
      for (const e of w.enemies) if (e.alive && e.kind !== 'warden') dists.push(Math.hypot(e.x - px, e.y - py));
      this.camZoomK = stepZoom(this.camZoomK, this.attractT !== null ? 1 : dynamicZoomTarget({ distances: dists }), dt);
    }
    let camDistZ = CAM_BASE_DIST * this.camZoomK * hint.distMul;
    {
      // Boss fight framing: blend toward the player+boss midpoint and zoom out (display only; Classic reuses camDistZ for its ortho zoom).
      const introBusy = this.attractT !== null || w.bossIntroTicks > 0 || this.introPan > 0.002 || this.introZoom > 0.002;
      const bcy = wardenE ? wardenY + wardenE.height * 0.5 : 0;
      const want = wardenE !== null && bossFramingWanted(wardenE.alive, wardenX - this.camFocus.x, bcy - this.camFocus.y, introBusy);
      this.bossFrameK += ((want ? 1 : 0) - this.bossFrameK) * Math.min(1, dt * (want ? 2.2 : 3.2));
      if (this.bossFrameK < 0.002) this.bossFrameK = 0;
      if (this.bossFrameK > 0 && wardenE) {
        const bc = bossCameraBlend({ px: this.camFocus.x, py: this.camFocus.y, bx: wardenX, by: bcy, k: this.bossFrameK, fovDeg: this.baseFov, aspect: this.camera.aspect, baseDist: camDistZ });
        this.camFocus.set(bc.fx, bc.fy, 0);
        camDistZ = bc.dist;
      }
    }
    if (this.attractT === null && (this.introPan > 0.002 || this.introZoom > 0.002) && wardenE) {
      // Intro: pan from the operative to the Warden and push in; eases back after the intro ends or is skipped.
      const bx = wardenX;
      const by = Math.max(room ? room.minY + 3 : 0, wardenY + 1.6);
      this.camFocus.x += (bx - this.camFocus.x) * this.introPan;
      this.camFocus.y += (by - this.camFocus.y) * this.introPan;
      camDistZ -= 5.5 * this.introZoom;
    }
    {
      // Room clamp: keep the frustum inside the (smoothed) room rectangle; narrow rooms are centered. Skipped for the intro pan.
      if (room) {
        const rect = this.frameRect.update(dt, { minX: room.minX, maxX: room.maxX, minY: room.minY, maxY: room.maxY }, px, py);
        const ext = frameHalfExtents(camDistZ, this.baseFov, this.camera.aspect);
        this.camHalfH = ext.halfH;
        const introActive = this.introPan > 0.002;
        const c = clampFocusToRect(this.camFocus.x, this.camFocus.y, ext.halfW, ext.halfH, rect);
        this.camRoomClamp = !introActive && (c.clampedX || c.clampedY);
        if (!introActive) this.camFocus.set(c.x, c.y, 0);
      }
    }
    if (this.attractT !== null) {
      // Reel shot (see ui/attract.ts): wide establishing view, then a low push-in on the action.
      const sh = this.attractShot ?? { dolly: 15.5 - 4.2 * (0.5 + 0.5 * Math.sin(this.attractT * 0.21)), sway: Math.sin(this.attractT * 0.33) * 3.4, lift: 1.2, lookDown: 0.4 };
      this.camera.position.set(this.camFocus.x + sh.sway, this.camFocus.y + sh.lift, sh.dolly);
      this.camera.lookAt(this.camFocus.x, this.camFocus.y + sh.lookDown, 0);
    } else {
      const shk = this.fx.trauma.sample(tSec, this.reduceMotion);
      this.camera.position.set(this.camFocus.x + shk.x, this.camFocus.y + 1.7 + shk.y, camDistZ);
      this.camera.lookAt(this.camFocus.x, this.camFocus.y, 0);
      this.camera.rotation.z += shk.roll;
    }
    const fov = this.baseFov - (this.attractT !== null ? 0 : this.fx.rig.fovKick);
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
    {
      this.camera.updateMatrixWorld();
      const v = this.camProbe.set(px, py + 0.9, 0).project(this.camera);
      this.camPlayerScreenY = (v.y + 1) / 2;
    }
    this.fxAdd.sync();
    this.fxAlpha.sync();
    this.fxSmoke.sync();
    this.goreChunks.sync();
    this.goreDecals.sync();
    this.popupLayer.sync();
    stepPostParams(this.postParams, w.currentRoom, dt, tSec, p.hp / Math.max(1, p.maxHp), this.fx.chroma, this.reduceMotion);
    {
      const f = this.fx.phaseFlash;
      const pc = BOSS_PHASE_COLORS[this.fx.bossPhase - 1];
      const melt = inMeltdown ? (this.reduceMotion ? 0.03 : 0.025 + 0.05 * sirenPulse) : 0;
      this.postParams.flash[0] = f * (0.45 + 0.4 * pc[0]) + melt;
      this.postParams.flash[1] = f * (0.4 + 0.3 * pc[1]) + melt * 0.1;
      this.postParams.flash[2] = f * (0.4 + 0.3 * pc[2]) + melt * 0.1;
    }
    applyPostParams(this.postPass, this.postParams, tSec);

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

    this.applyViewCulling(w);
    this.renderer.info.reset();
    const drawT0 = performance.now();
    if (this.viewMode === 'classic' && this.classic) {
      this.syncOrtho();
      const hurt = this.postParams.lowHp * this.postParams.pulse;
      this.classic.render(this.scene, this.orthoCamera, { flash: this.postParams.flash, hurt, crt: this.crtOn });
    } else {
      this.composer.render();
    }
    this.frameMs.draw = performance.now() - drawT0;
  }

  private syncDynamicFX(w: WorldState3D, _dt: number): void {
    const tSec = performance.now() * 0.001;
    const inMeltdown = w.coreDestroyed && w.meltdownTicks >= 0;
    // Projectiles are drawn by FxDirector.projectileGlow (additive particle pool): no per-shot meshes.

    // Boss shockwaves: twin floor waves travelling east and west (jump over them)
    const liveSw = new Set<number>();
    for (const sw of w.shockwaves) {
      liveSw.add(sw.id);
      let grp = this.ringMeshes.get(sw.id) as unknown as THREE.Group | undefined;
      if (!grp) {
        grp = new THREE.Group();
        const tint = sw.phase === 2 ? 0xff2944 : 0xff7b26;
        for (let k = 0; k < 2; k++) {
          const wave = new THREE.Mesh(this.blastPlane, createGroundWaveMaterial(tint));
          wave.scale.set(k === 0 ? 2.6 : -2.6, 1.5, 1);
          wave.renderOrder = 8;
          grp.add(wave);
        }
        this.dynGroup.add(grp);
        this.ringMeshes.set(sw.id, grp as unknown as THREE.Mesh);
      }
      // Plane origin is its centre: shift by half the wave length so the leading edge sits on the hit radius.
      grp.children[0].position.set(sw.x + sw.radius - 1.1, sw.y + 0.75, 0.2);
      grp.children[1].position.set(sw.x - sw.radius + 1.1, sw.y + 0.75, 0.2);
      for (const c of grp.children) ((c as THREE.Mesh).material as THREE.ShaderMaterial).uniforms.uT.value = tSec;
    }
    for (const [id, m] of this.ringMeshes) {
      if (!liveSw.has(id)) {
        this.dynGroup.remove(m);
        const grp = m as unknown as THREE.Group;
        for (const c of grp.children) {
          ((c as THREE.Mesh).material as THREE.Material).dispose();
        }
        this.ringMeshes.delete(id);
      }
    }

    // Explosions: noise fireball + shock ring (shaders in fx3dGfx). Smoke, sparks and debris come from FxDirector.onExplosion.
    const liveEx = new Set<number>();
    let flashK = 0;
    let flashX = 0;
    let flashY = 0;
    let flashColor = 0xffa040;
    for (const ex of w.explosions) {
      liveEx.add(ex.id);
      let grp = this.explMeshes.get(ex.id);
      if (!grp) {
        grp = new THREE.Group();
        grp.name = `explosion:${ex.id}`;
        const ball = new THREE.Mesh(this.blastSphere, createFireballMaterial(ex.color, (ex.id * 7.31) % 50));
        ball.name = `explosion-fire:${ex.id}`;
        ball.renderOrder = 8;
        const ring = new THREE.Mesh(this.blastPlane, createShockRingMaterial(ex.color));
        ring.name = `explosion-ring:${ex.id}`;
        ring.renderOrder = 8;
        grp.add(ball, ring);
        this.dynGroup.add(grp);
        this.explMeshes.set(ex.id, grp);
      }
      const p = 1 - ex.ticksLeft / ex.maxTicks;
      grp.position.set(ex.x, ex.y, 0.3);
      const ball = grp.children[0] as THREE.Mesh;
      const ring = grp.children[1] as THREE.Mesh;
      const grow = 1 - Math.pow(1 - Math.min(1, p * 2.4), 2);
      ball.scale.setScalar(0.3 + grow * ex.maxRadius * 0.45);
      (ball.material as THREE.ShaderMaterial).uniforms.uP.value = p;
      ring.scale.setScalar(Math.min(ex.maxRadius * 2.1, 9));
      (ring.material as THREE.ShaderMaterial).uniforms.uP.value = p;
      const k = Math.max(0, 1 - p * 2.6) * Math.min(1, ex.maxRadius / 3);
      if (k > flashK) {
        flashK = k;
        flashX = ex.x;
        flashY = ex.y;
        flashColor = ex.color;
      }
    }
    for (const [id, m] of this.explMeshes) {
      if (!liveEx.has(id)) {
        this.dynGroup.remove(m);
        for (const c of m.children) ((c as THREE.Mesh).material as THREE.Material).dispose();
        this.explMeshes.delete(id);
      }
    }
    // Short light flash: reuse the alarm light (idle outside Meltdown), so no PointLight is added.
    if (flashK > 0.01 && !inMeltdown) {
      this.alarmLight.color.setHex(0xffb060).lerp(_FLASH_TMP.setHex(flashColor), 0.3);
      this.alarmLight.position.set(flashX, flashY + 0.5, 3.2);
      this.alarmLight.intensity = 46 * flashK;
    } else if (!inMeltdown) {
      this.alarmLight.color.setHex(0xff2936);
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
        const halo = new THREE.Mesh(
          new THREE.CylinderGeometry(0.34, 0.34, len, 10),
          new THREE.MeshBasicMaterial({ color: 0x9a4dff, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false }),
        );
        halo.name = `beam-halo:${bm.id}`;
        mesh.add(halo);
        mesh.position.copy(a).lerp(b, 0.5);
        mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
        this.dynGroup.add(mesh);
        this.beamMeshes.set(bm.id, mesh);
      }
      const bf = bm.ticksLeft / bm.maxTicks;
      (mesh.material as THREE.MeshBasicMaterial).opacity = bf;
      // Beam collapses to a thread as it fades; the halo flares first, then dies faster.
      mesh.scale.set(0.25 + 0.75 * bf, 1, 0.25 + 0.75 * bf);
      const halo = mesh.children[0] as THREE.Mesh | undefined;
      if (halo) (halo.material as THREE.MeshBasicMaterial).opacity = 0.34 * bf * bf;
    }
    for (const [id, m] of this.beamMeshes) {
      if (!liveBm.has(id)) {
        this.dynGroup.remove(m);
        for (const c of m.children) {
          const cm = c as THREE.Mesh;
          cm.geometry.dispose();
          (cm.material as THREE.Material).dispose();
        }
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
        this.beamMeshes.delete(id);
      }
    }
  }
}
