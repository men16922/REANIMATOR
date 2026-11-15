// Browser shell: fixed-rate 60 Hz Full 3D side-view Metroidvania simulation,
// Three.js WebGL2 renderer (with Canvas2D fallback), 4-weapon switching, sector minimap, WebAudio SFX,
// preserved 15 Hz DOS Restoration Lab, and smoke/showcase inspection hooks.

import { ABILITY_3D, spawnBody3D } from '../engine/motion3d.ts';
import { LIGHT } from '../game/light.ts';
import { createBot3D, type Bot3D } from '../game3d/bot3d.ts';
import type { DoorLockKind3D, WeaponSlot3D } from '../game3d/types3d.ts';
import {
  emptyInput3D,
  getPlayerPose3D,
  newWorld3D,
  respawnPlayer3D,
  stepWorld3D,
  WEAPON_META,
  type InputState3D,
  type WorldState3D,
} from '../game3d/world3d.ts';
import { fallbackScreenToWorld, renderFallback2D3D } from '../render3d/fallback2d.ts';
import { Scene3DRenderer } from '../render3d/scene3dFull.ts';
import { getAudioDebug, setBgmVolume, setSfxVolume, setVolume, sfx } from './audio.ts';
import { AudioDirector, snapshotPre } from './audioDirector.ts';
import { labFields, labScenarios, plot, runCase, type LabCase } from './lab.ts';
import { renderMinimap } from './minimap.ts';

const SIM_HZ_3D = 60;
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('screen');

// Must probe WebGL2 BEFORE any getContext('2d') call, because a canvas locks context type on first acquire.
let scene3d: Scene3DRenderer | null = null;
try {
  scene3d = new Scene3DRenderer(canvas);
} catch {
  scene3d = null;
}
const rendererMode: 'webgl-3d' | 'canvas-2d' = scene3d ? 'webgl-3d' : 'canvas-2d';
if (!scene3d) {
  canvas.classList.add('fallback2d');
}

const ui = {
  title: $('title'),
  pause: $('pause'),
  result: $('result'),
  revived: $('revived'),
  bootsPill: $('boots-pill'),
  etankCount: $('etank-count'),
  minimap: $<HTMLCanvasElement>('minimap'),
  minimapWrap: $('minimap-wrap'),
  hud: $('hud'),
  hp: $('hp'),
  hpBar: $('hp-bar'),
  dashBar: $('dash-bar'),
  battery: $('battery'),
  kills: $('kills'),
  objective: $('objective'),
  meltdown: $('meltdown'),
  meltdownTime: $('meltdown-time'),
  time: $('time'),
  sector: $('sector'),
  sectorHint: $('sector-hint'),
  wardenHud: $('warden-hud'),
  wardenPhase: $('warden-phase'),
  wardenHp: $('warden-hp'),
  damageFlash: $('damage-flash'),
  resultTitle: $('result-title'),
  resultDetail: $('result-detail'),
  reduceFlash: $<HTMLInputElement>('reduce-flash'),
};

type Mode = 'title' | 'playing' | 'paused' | 'result';
let mode: Mode = 'title';
let world: WorldState3D = newWorld3D();
let acc = 0;
let last = 0;
let flash = 0;
let manualHold = false;
let mapExpanded = false;
let bot: Bot3D | null = null;
const audioDirector = new AudioDirector();

const keys = new Set<string>();
const mouse = { ndcX: 0.28, ndcY: 0.08, normX: 0.64, normY: 0.46, leftDown: false, rightDown: false };
let lightQueued = false;
let dashQueued = false;
let interactQueued = false;
let weaponQueue: WeaponSlot3D | 0 = 0;

function cycleWeapon(dir: 1 | -1): void {
  const unlocked = ([1, 2, 3, 4] as WeaponSlot3D[]).filter((s) => world.player.unlocked[s]);
  if (unlocked.length <= 1) return;
  const idx = unlocked.indexOf(world.player.weapon);
  const nextIdx = (idx + dir + unlocked.length) % unlocked.length;
  weaponQueue = unlocked[nextIdx];
}

function currentAim3D(): { x: number; y: number } {
  if (scene3d) {
    const a = scene3d.screenToWorldAim(mouse.ndcX, mouse.ndcY, world);
    return { x: a.x, y: a.y };
  }
  return fallbackScreenToWorld(canvas, world, mouse.normX, mouse.normY);
}

function buildInput(): InputState3D {
  const moveX = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
  const toggleLight = lightQueued;
  lightQueued = false;
  const dash = dashQueued || keys.has('ShiftLeft') || keys.has('ShiftRight') || mouse.rightDown;
  dashQueued = false;
  const interact = interactQueued || keys.has('KeyF');
  interactQueued = false;
  const weaponSlot = weaponQueue;
  weaponQueue = 0;

  const aim = currentAim3D();
  return {
    moveX,
    jump: keys.has('Space') || keys.has('KeyW') || keys.has('ArrowUp'),
    dash,
    fire: mouse.leftDown,
    interact,
    dropDown: keys.has('KeyS') || keys.has('ArrowDown'),
    toggleLight,
    weaponSlot,
    aimX: aim.x,
    aimY: aim.y,
  };
}

function releaseInput(): void {
  keys.clear();
  mouse.leftDown = false;
  mouse.rightDown = false;
  lightQueued = false;
  dashQueued = false;
  interactQueued = false;
  weaponQueue = 0;
}

function show(m: Mode): void {
  mode = m;
  ui.title.hidden = m !== 'title';
  ui.pause.hidden = m !== 'paused';
  ui.result.hidden = m !== 'result';
  ui.hud.hidden = m === 'title';
  ui.revived.hidden = true;
  $('lab').hidden = true;
  audioDirector.syncBeds(world, m === 'playing');
  if (m === 'playing') canvas.focus();
}

function start(): void {
  manualHold = false;
  world = newWorld3D();
  audioDirector.reset();
  bot = null;
  acc = 0;
  flash = 0;
  scene3d?.fx.reset();
  releaseInput();
  show('playing');
}

function zoneMeta(): { name: string; hint: string } {
  const r = world.level.rooms.find((x) => x.sector === world.currentRoom);
  if (!r) return { name: 'TRANSIT', hint: '' };
  return { name: `${r.sector.toUpperCase()} · ${r.name.toUpperCase()}`, hint: r.hint };
}

function drawMinimap(): void {
  const L = world.level;
  const room = L.rooms.find((r) => r.sector === world.currentRoom);
  const doors = L.solids
    .filter((s) => s.doorId && s.doorLock)
    .map((s) => ({ id: s.doorId as string, x: (s.minX + s.maxX) / 2, y: (s.minY + s.maxY) / 2, lock: s.doorLock as DoorLockKind3D }));
  const visited = new Set(L.rooms.filter((r) => world.visitedRooms.includes(r.sector)).map((r) => r.id));
  renderMinimap(ui.minimap, {
    rooms: L.rooms,
    visitedRooms: visited,
    currentRoomId: room ? room.id : L.rooms[0].id,
    playerX: world.player.body.x,
    playerY: world.player.body.y,
    openDoors: world.openDoors,
    doors,
    saveStations: L.saveStations,
    coreDestroyed: world.coreDestroyed,
    bossAlive: world.enemies.some((e) => e.kind === 'warden' && e.alive),
    exitPos: L.exitPos,
    expanded: mapExpanded,
  });
}

function hud(): void {
  const p = world.player;
  ui.hp.textContent = String(p.hp);
  ui.hpBar.style.width = `${Math.max(0, Math.min(100, (p.hp / p.maxHp) * 100))}%`;
  ui.hpBar.style.background = p.hp > 60 ? '#3dff88' : p.hp > 30 ? '#f5b942' : '#ff4757';

  const dashPct = ((ABILITY_3D.dashCooldownTicks - p.body.dashCooldown) / ABILITY_3D.dashCooldownTicks) * 100;
  ui.dashBar.style.width = `${Math.max(0, Math.min(100, dashPct))}%`;

  ui.battery.style.width = `${Math.max(0, Math.min(100, (world.light.battery / LIGHT.max) * 100))}%`;
  ui.battery.style.background = world.light.on ? '#f6e27a' : '#7d7340';
  ui.kills.textContent = String(p.kills);
  ui.time.textContent = `${(world.tick / SIM_HZ_3D).toFixed(1)}s`;

  // Objective & Meltdown
  const objMap = {
    console: { text: 'OBJ: Arm the Security Console, break locks to reach the Core Vault', color: '#8ec5ff' },
    warden: { text: 'OBJ: Slay the Core Warden (Core Vault)', color: '#ffae6b' },
    core: { text: 'OBJ: Shatter the Reactor Core!', color: '#4be8ff' },
    escape: { text: 'OBJ: ESCAPE to the Airlock extraction balcony!', color: '#5aff9c' },
    won: { text: 'EXTRACTED SAFELY', color: '#5aff9c' },
  } as const;
  const obj = objMap[world.phase];
  ui.objective.textContent = obj.text;
  ui.objective.style.color = obj.color;

  if (world.meltdownTicks >= 0) {
    ui.meltdown.hidden = false;
    ui.meltdownTime.textContent = `${(world.meltdownTicks / SIM_HZ_3D).toFixed(1)}s`;
  } else {
    ui.meltdown.hidden = true;
  }

  // 4-Weapon Hotbar
  for (const s of [1, 2, 3, 4] as WeaponSlot3D[]) {
    const el = $(`wpn-${s}`);
    const ammoEl = $(`ammo-${s}`);
    const unlocked = p.unlocked[s];
    el.classList.toggle('active', p.weapon === s);
    el.classList.toggle('locked', !unlocked);
    ammoEl.textContent = s === 1 ? 'INF' : unlocked ? String(p.ammo[s]) : '--';
  }

  const zm = zoneMeta();
  ui.sector.textContent = zm.name;
  ui.sectorHint.textContent = world.hintTicks > 0 ? world.hint : zm.hint;
  ui.bootsPill.hidden = !p.abilities.thrusterBoots;
  ui.etankCount.textContent = `${p.energyTanks}/${world.level.upgrades.filter((u) => u.kind === 'energy_tank').length}`;
  drawMinimap();

  const warden = world.enemies.find((e) => e.kind === 'warden');
  const showBoss = Boolean(warden && warden.alive && world.currentRoom === 'core');
  ui.wardenHud.hidden = !showBoss;
  if (showBoss && warden) {
    ui.wardenHp.style.width = `${Math.max(0, Math.min(100, (warden.hp / warden.maxHp) * 100))}%`;
    ui.wardenPhase.textContent = warden.phase === 2 ? 'PHASE II' : 'PHASE I';
  }

  ui.damageFlash.style.opacity = ui.reduceFlash.checked ? '0' : String(Math.min(0.85, flash));
}

function renderWorld(alpha = 1): void {
  if (scene3d) {
    scene3d.render(world, alpha);
  } else {
    renderFallback2D3D(canvas, world);
  }
}

function handlePostStepAudio(pre: ReturnType<typeof snapshotPre>): void {
  if (world.player.hp < pre.hp) flash = 1;
  scene3d?.fx.observe(world);
  audioDirector.afterStep(world, pre);
}

function frame(t: number): void {
  const dt = Math.min(0.1, (t - last) / 1000 || 1 / 60);
  last = t;
  const fx = scene3d?.fx;
  let frozen = false;
  if (mode === 'playing' && !manualHold) {
    // Hit-stop and kill slow-motion only retime the display clock. Every simulation tick still runs, in order.
    frozen = fx ? fx.hitstop.step() : false;
    const clock = fx ? fx.slowmo.step(dt) : 1;
    if (!frozen) acc += dt * clock;
    const stepDt = 1 / SIM_HZ_3D;
    let steps = 0;
    while (acc >= stepDt && steps < 4) {
      const pre = snapshotPre(world);
      world = stepWorld3D(world, buildInput());
      handlePostStepAudio(pre);
      acc -= stepDt;
      steps++;
      if (world.status !== 'playing') {
        const secs = (world.tick / SIM_HZ_3D).toFixed(1);
        ui.resultTitle.textContent = world.status === 'won' ? 'Escaped with the core' : 'Signal lost';
        const lost = world.status === 'lost';
        const canResume = lost && !!world.lastSaveId;
        const cp = lost ? (canResume ? ' · press C or use the button to resume at the last Save station' : ' · no Save station reached yet, Play again restarts the run') : '';
        ui.resultDetail.textContent = `${secs}s · ${world.player.kills} hostiles eliminated · weapon [${WEAPON_META[world.player.weapon].name}]${cp}`;
        $('resume-save').hidden = !canResume;
        if (world.status === 'lost') sfx.lose();
        show('result');
        break;
      }
    }
    if (!frozen) flash = Math.max(0, flash - dt * 3.2);
  }
  if (scene3d) {
    scene3d.reduceMotion = ui.reduceFlash.checked;
    scene3d.fxTimeScale = frozen ? 0 : fx ? fx.slowmo.scale : 1;
  }
  renderWorld(mode === 'playing' && !manualHold ? Math.min(1, acc * SIM_HZ_3D) : 1);
  hud();
  requestAnimationFrame(frame);
}

function resumeAtSave(): boolean {
  if (mode !== 'result' || world.status !== 'lost' || !world.lastSaveId) return false;
  respawnPlayer3D(world);
  scene3d?.fx.reset();
  audioDirector.reset();
  releaseInput();
  show('playing');
  return true;
}

// ---- Input Listeners ----
canvas.tabIndex = 0;
window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape' || e.code === 'KeyP') {
    if (mode === 'playing') {
      releaseInput();
      show('paused');
    } else if (mode === 'paused') {
      manualHold = false;
      show('playing');
    }
    e.preventDefault();
    return;
  }
  if (mode === 'result' && e.code === 'KeyC' && resumeAtSave()) {
    e.preventDefault();
    return;
  }
  if (mode !== 'playing') return;
  manualHold = false;
  if (e.code === 'KeyE' && !e.repeat) lightQueued = true;
  if ((e.code === 'ShiftLeft' || e.code === 'ShiftRight') && !e.repeat) dashQueued = true;
  if (e.code === 'KeyF' && !e.repeat) interactQueued = true;
  if (e.code === 'Digit1' && !e.repeat) weaponQueue = 1;
  if (e.code === 'Digit2' && !e.repeat) weaponQueue = 2;
  if (e.code === 'Digit3' && !e.repeat) weaponQueue = 3;
  if (e.code === 'Digit4' && !e.repeat) weaponQueue = 4;
  if (e.code === 'KeyQ' && !e.repeat) cycleWeapon(1);
  if (e.code === 'KeyR' && !e.repeat) start();
  if (e.code === 'Tab') {
    if (!e.repeat) mapExpanded = !mapExpanded;
    e.preventDefault();
    return;
  }
  keys.add(e.code);
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
canvas.addEventListener('mousemove', (e) => {
  const r = canvas.getBoundingClientRect();
  mouse.normX = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
  mouse.normY = Math.max(0, Math.min(1, (e.clientY - r.top) / r.height));
  mouse.ndcX = mouse.normX * 2 - 1;
  mouse.ndcY = -(mouse.normY * 2 - 1);
});
canvas.addEventListener('mousedown', (e) => {
  if (mode === 'playing') manualHold = false;
  if (e.button === 0) mouse.leftDown = true;
  if (e.button === 2) {
    mouse.rightDown = true;
    dashQueued = true;
  }
});
window.addEventListener('mouseup', (e) => {
  if (e.button === 0) mouse.leftDown = false;
  if (e.button === 2) mouse.rightDown = false;
});
canvas.addEventListener(
  'wheel',
  (e) => {
    if (mode !== 'playing') return;
    e.preventDefault();
    cycleWeapon(e.deltaY > 0 ? 1 : -1);
  },
  { passive: false },
);
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
window.addEventListener('blur', () => {
  releaseInput();
  if (mode === 'playing') show('paused');
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && mode === 'playing') {
    releaseInput();
    show('paused');
  }
});

$('play').addEventListener('click', start);
for (const id of ['volume', 'volume-p']) {
  const el = $<HTMLInputElement>(id);
  el.addEventListener('input', () => {
    setVolume(Number(el.value) / 100);
    for (const other of ['volume', 'volume-p']) $<HTMLInputElement>(other).value = el.value;
  });
}
$<HTMLInputElement>('volume-bgm').addEventListener('input', (e) => setBgmVolume(Number((e.target as HTMLInputElement).value) / 100));
$<HTMLInputElement>('volume-sfx').addEventListener('input', (e) => setSfxVolume(Number((e.target as HTMLInputElement).value) / 100));
$('restart').addEventListener('click', start);
$('resume-save').addEventListener('click', () => { resumeAtSave(); });
$('restart-p').addEventListener('click', start);
$('resume').addEventListener('click', () => {
  manualHold = false;
  show('playing');
});
$('revived-open').addEventListener('click', () => {
  ui.revived.hidden = false;
});
$('revived-close').addEventListener('click', () => {
  ui.revived.hidden = true;
});

// ---- Restoration Lab (Preserved 15 Hz DOS Engine Proof) ----
const labSel = $<HTMLSelectElement>('lab-scenario');
const labMut = $<HTMLInputElement>('lab-mutation');
const labTick = $<HTMLInputElement>('lab-tick');
const labPlot = $<HTMLCanvasElement>('lab-plot').getContext('2d')!;
let lab: LabCase | null = null;
for (const s of labScenarios()) {
  const o = document.createElement('option');
  o.value = s.id;
  o.textContent = `${s.id}${s.holdout ? ' (holdout, judged once)' : ''}`;
  labSel.append(o);
}
function labRender(): void {
  if (!lab) return;
  const i = Number(labTick.value);
  plot(labPlot, lab, i);
  const e = lab.expected[i],
    a = lab.actual[i];
  const n = lab.scenario.startN + i;
  $('lab-n').textContent = `n=${n}`;
  $('lab-table').innerHTML =
    '<tr><th>field</th><th>recorded</th><th>replay</th></tr>' +
    labFields()
      .map((f) => `<tr class="${e[f] !== a[f] ? 'diff' : ''}"><th>${f}</th><td>${e[f]}</td><td>${a[f]}</td></tr>`)
      .join('');
}
function labRun(): void {
  const s = labScenarios().find((x) => x.id === labSel.value)!;
  lab = runCase(s, labMut.checked);
  labTick.max = String(lab.expected.length - 1);
  if (Number(labTick.value) > lab.expected.length - 1) labTick.value = '0';
  const fd = lab.firstDifference as { index: number; field: string } | undefined;
  $('lab-status').textContent = `${lab.status}${lab.mutation ? ' — demo mutation' : ''}${
    fd ? ` · first difference n=${lab.scenario.startN + fd.index} ${fd.field}` : ` · ${lab.expected.length} ticks × ${labFields().length} fields`
  }`;
  if (fd) labTick.value = String(fd.index);
  labRender();
}
labSel.addEventListener('change', labRun);
labMut.addEventListener('change', labRun);
labTick.addEventListener('input', labRender);
$('lab-open').addEventListener('click', () => {
  $('lab').hidden = false;
  labRun();
});
$('lab-close').addEventListener('click', () => {
  $('lab').hidden = true;
});

function buildSnapshot() {
  const warden = world.enemies.find((e) => e.kind === 'warden');
  const tel = scene3d
    ? scene3d.getTelemetry()
    : { modelsLoaded: false, loadedModels: [], failedModels: [], riggedCount: 0, activeAnimations: {}, fx: null, enemyRender: {} as Record<string, { yaw: number; clip: string; timeScale: number; x: number; y: number; z: number }> };
  const b = world.player.body;
  return {
    lab: lab ? { id: lab.scenario.id, status: lab.status, mutation: lab.mutation } : null,
    mode,
    status: world.status,
    phase: world.phase,
    tick: world.tick,
    x: b.x,
    y: b.y,
    z: b.z,
    vx: b.vx,
    vy: b.vy,
    grounded: b.grounded,
    jumpsUsed: b.jumpsUsed,
    bodyState: b.state,
    facing: world.player.facing,
    pose: getPlayerPose3D(world),
    hp: world.player.hp,
    maxHp: world.player.maxHp,
    energyTanks: world.player.energyTanks,
    abilities: { ...world.player.abilities },
    currentRoom: world.currentRoom,
    visitedRooms: [...world.visitedRooms],
    collectedUpgrades: [...world.collectedUpgrades],
    lastSaveId: world.lastSaveId,
    consoleUnlocked: world.consoleUnlocked,
    weapon: world.player.weapon,
    unlocked: { ...world.player.unlocked },
    ammo: { ...world.player.ammo },
    kills: world.player.kills,
    dashCooldown: b.dashCooldown,
    bossHp: warden ? warden.hp : 0,
    bossMaxHp: warden ? warden.maxHp : 0,
    bossPhase: warden ? warden.phase : 1,
    coreHp: world.coreHp,
    coreDestroyed: world.coreDestroyed,
    meltdownTicks: world.meltdownTicks,
    openDoors: [...world.openDoors],
    light: world.light,
    startX: world.level.spawn.x,
    startY: world.level.spawn.y,
    rendererMode,
    ...tel,
  };
}

/** Debug-only world setup for smoke tests and showcase captures (never used by normal play). */
export interface DebugSetup3D {
  x?: number;
  y?: number;
  boots?: boolean;
  tanks?: number;
  weapons?: WeaponSlot3D[];
  openDoors?: string[];
  console?: boolean;
  hp?: number;
  aimX?: number;
  aimY?: number;
}

function applyDebugSetup(w: WorldState3D, o: DebugSetup3D): void {
  const p = w.player;
  if (o.x !== undefined || o.y !== undefined) {
    p.body = spawnBody3D(o.x ?? p.body.x, o.y ?? p.body.y, 0);
  }
  if (o.boots) p.abilities.thrusterBoots = true;
  if (o.tanks !== undefined) {
    p.energyTanks = o.tanks;
    p.maxHp = 100 + 30 * o.tanks;
    p.hp = p.maxHp;
  }
  for (const s of o.weapons ?? []) {
    p.unlocked[s] = true;
    if (s !== 1) p.ammo[s as 2 | 3 | 4] = WEAPON_META[s].initialAmmo;
  }
  for (const d of o.openDoors ?? []) w.openDoors.add(d);
  if (o.console) w.consoleUnlocked = true;
  if (o.hp !== undefined) p.hp = o.hp;
  if (o.aimX !== undefined) p.aimX = o.aimX;
  if (o.aimY !== undefined) p.aimY = o.aimY;
}

// Read-only test & showcase inspection hooks
const wAny = window as unknown as {
  __reanimator: () => ReturnType<typeof buildSnapshot>;
  __reanimatorAdvance: (inputs: Partial<InputState3D>[], setup?: DebugSetup3D) => ReturnType<typeof buildSnapshot>;
  __reanimatorStep: (inputs: Partial<InputState3D>[], alpha?: number) => ReturnType<typeof buildSnapshot>;
  __reanimatorRunBot: (maxTicks: number, untilStep?: string) => ReturnType<typeof buildSnapshot>;
  __reanimatorAudio: typeof getAudioDebug;
  __reanimatorPick: (px: number, py: number, includePoints?: boolean) => Array<Record<string, unknown>>;
};

function enterManual(): void {
  manualHold = true;
  acc = 0;
  flash = 0;
  releaseInput();
  show('playing');
}

wAny.__reanimator = buildSnapshot;
/** Debug: audio graph state, current theme, voice counters and the last 48 sound ids (see docs). */
wAny.__reanimatorAudio = getAudioDebug;
/** Fresh world, optional setup, then run the given input frames. */
wAny.__reanimatorAdvance = (inputs, setup) => {
  world = newWorld3D();
  bot = null;
  if (setup) applyDebugSetup(world, setup);
  scene3d?.fx.reset();
  enterManual();
  for (const inp of inputs) {
    world = stepWorld3D(world, { ...emptyInput3D(), aimX: world.player.body.x + world.player.facing * 8, aimY: world.player.body.y + 1.12, ...inp });
    if (world.status !== 'playing') break;
  }
  scene3d?.fx.observe(world, true);
  renderWorld();
  hud();
  return buildSnapshot();
};
/** Continue the current world with more input frames (no reset). */
wAny.__reanimatorStep = (inputs, alpha = 1) => {
  enterManual();
  for (const inp of inputs) {
    world = stepWorld3D(world, { ...emptyInput3D(), aimX: world.player.body.x + world.player.facing * 8, aimY: world.player.body.y + 1.12, ...inp });
    scene3d?.fx.observe(world);
    if (world.status !== 'playing') break;
  }
  renderWorld(alpha);
  hud();
  return buildSnapshot();
};
/** Let the deterministic bot play the current world forward (optionally until a named step is reached). */
wAny.__reanimatorRunBot = (maxTicks, untilStep) => {
  enterManual();
  if (!bot) bot = createBot3D(world);
  for (let i = 0; i < maxTicks && world.status === 'playing'; i++) {
    if (untilStep && bot.stepLabel === untilStep) break;
    world = stepWorld3D(world, bot.next(world));
  }
  scene3d?.fx.observe(world, true);
  renderWorld();
  hud();
  return buildSnapshot();
};

/** Debug only: list meshes under a CSS-pixel viewport point, nearest first. */
wAny.__reanimatorPick = (px, py, includePoints = false) => scene3d?.pickAt(px, py, includePoints) ?? [];

show('title');
requestAnimationFrame(frame);
