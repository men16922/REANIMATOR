// Browser shell: fixed-rate 60 Hz Full 3D Quarter-View Twin-Stick simulation,
// Three.js WebGL2 renderer (with Canvas2D fallback), 4-weapon switching, WebAudio SFX,
// preserved 15 Hz DOS Restoration Lab, and smoke/showcase inspection hooks.

import { ABILITY_3D } from '../engine/motion3d.ts';
import { LIGHT } from '../game/light.ts';
import type { WeaponSlot3D } from '../game3d/map3d.ts';
import {
  emptyInput3D,
  newWorld3D,
  stepWorld3D,
  WEAPON_META,
  type InputState3D,
  type WorldState3D,
} from '../game3d/world3d.ts';
import { renderFallback2D3D } from '../render3d/fallback2d.ts';
import { Scene3DRenderer } from '../render3d/scene3dFull.ts';
import { ambient, playSoundEvent3D, setVolume, sfx } from './audio.ts';
import { labFields, labScenarios, plot, runCase, type LabCase } from './lab.ts';

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

function currentAim3D(): { x: number; y: number; z: number } {
  if (scene3d) {
    return scene3d.screenToWorldAim(mouse.ndcX, mouse.ndcY, world);
  }
  const px = world.player.body.x;
  const pz = world.player.body.z;
  return {
    x: px + (mouse.normX - 0.45) * 24,
    y: world.player.body.y + 1.05,
    z: pz + (mouse.normY - 0.5) * 16,
  };
}

function buildInput(): InputState3D {
  const rawX = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
  const rawZ = (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0);
  const len = Math.hypot(rawX, rawZ);
  const moveX = len > 0 ? rawX / len : 0;
  const moveZ = len > 0 ? rawZ / len : 0;

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
    moveZ,
    jump: keys.has('Space'),
    dash,
    fire: mouse.leftDown,
    interact,
    toggleLight,
    weaponSlot,
    aimX: aim.x,
    aimY: aim.y,
    aimZ: aim.z,
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
  ambient(m === 'playing', world.meltdownTicks >= 0);
  if (m === 'playing') canvas.focus();
}

function start(): void {
  manualHold = false;
  world = newWorld3D();
  acc = 0;
  flash = 0;
  releaseInput();
  show('playing');
}

function zoneMeta(x: number): { name: string; hint: string } {
  if (x < 23.2) {
    return {
      name: 'ZONE A · CRYO BAY',
      hint: 'Climb north ramp for Scattergun [2], then breach East Archway ->',
    };
  }
  if (x < 51.0) {
    return {
      name: 'ZONE B · BIO-PROCESSING',
      hint: 'Jump over green acid cooling pit · Reach upper catwalk Security Console [F] ->',
    };
  }
  if (x < 78.0) {
    return {
      name: 'ZONE C · REACTOR VAULT',
      hint: 'Grab Rail-Cannon [4] · Jump red shockwave rings · Break Power Core!',
    };
  }
  return {
    name: 'ZONE D · EXTRACTION GAUNTLET',
    hint: 'Trigger bio-barrel chain & Jet-Dash [Shift] east to Exit Portal!',
  };
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
    console: { text: 'OBJ: Hack Zone B Console [F]', color: '#8ec5ff' },
    warden: { text: 'OBJ: Slay Core Warden (Zone C)', color: '#ffae6b' },
    core: { text: 'OBJ: Shatter Reactor Core!', color: '#4be8ff' },
    escape: { text: 'OBJ: ESCAPE -> Zone D Exit Gate!', color: '#5aff9c' },
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

  const zm = zoneMeta(p.body.x);
  ui.sector.textContent = zm.name;
  ui.sectorHint.textContent = zm.hint;

  const warden = world.enemies.find((e) => e.kind === 'warden');
  const showBoss = Boolean(warden && warden.alive && p.body.x >= 44);
  ui.wardenHud.hidden = !showBoss;
  if (showBoss && warden) {
    ui.wardenHp.style.width = `${Math.max(0, Math.min(100, (warden.hp / warden.maxHp) * 100))}%`;
    ui.wardenPhase.textContent = warden.phase === 2 ? 'PHASE II' : 'PHASE I';
  }

  ui.damageFlash.style.opacity = ui.reduceFlash.checked ? '0' : String(Math.min(0.85, flash));
}

function renderWorld(): void {
  if (scene3d) {
    scene3d.render(world);
  } else {
    renderFallback2D3D(canvas, world);
  }
}

function handlePostStepAudio(beforeHp: number, beforeLightOn: boolean, beforeMeltdown: number): void {
  if (world.player.hp < beforeHp) flash = 1;
  if (world.light.on !== beforeLightOn) (world.light.on ? sfx.lightOn : sfx.lightOff)();
  if (beforeMeltdown < 0 && world.meltdownTicks >= 0) ambient(true, true);
  if (world.meltdownTicks > 0 && world.tick % 45 === 0) sfx.alarm();
  for (const ev of world.events) playSoundEvent3D(ev);
}

function frame(t: number): void {
  const dt = Math.min(0.1, (t - last) / 1000 || 1 / 60);
  last = t;
  if (mode === 'playing' && !manualHold) {
    acc += dt;
    const stepDt = 1 / SIM_HZ_3D;
    let steps = 0;
    while (acc >= stepDt && steps < 4) {
      const beforeHp = world.player.hp;
      const beforeLightOn = world.light.on;
      const beforeMeltdown = world.meltdownTicks;
      world = stepWorld3D(world, buildInput());
      handlePostStepAudio(beforeHp, beforeLightOn, beforeMeltdown);
      acc -= stepDt;
      steps++;
      if (world.status !== 'playing') {
        const secs = (world.tick / SIM_HZ_3D).toFixed(1);
        ui.resultTitle.textContent = world.status === 'won' ? 'Escaped with the core' : 'Signal lost';
        ui.resultDetail.textContent = `${secs}s · ${world.player.kills} hostiles eliminated · weapon [${WEAPON_META[world.player.weapon].name}]`;
        if (world.status === 'lost') sfx.lose();
        show('result');
        break;
      }
    }
    flash = Math.max(0, flash - dt * 3.2);
  }
  renderWorld();
  hud();
  requestAnimationFrame(frame);
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
$('restart').addEventListener('click', start);
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
    : { modelsLoaded: false, loadedModels: [], failedModels: [], riggedCount: 0, activeAnimations: {} };
  return {
    lab: lab ? { id: lab.scenario.id, status: lab.status, mutation: lab.mutation } : null,
    mode,
    status: world.status,
    phase: world.phase,
    tick: world.tick,
    x: world.player.body.x,
    y: world.player.body.y,
    z: world.player.body.z,
    hp: world.player.hp,
    maxHp: world.player.maxHp,
    weapon: world.player.weapon,
    unlocked: { ...world.player.unlocked },
    ammo: { ...world.player.ammo },
    kills: world.player.kills,
    aimYaw: world.player.aimYaw,
    dashCooldown: world.player.body.dashCooldown,
    bossHp: warden ? warden.hp : 0,
    bossMaxHp: warden ? warden.maxHp : 0,
    bossPhase: warden ? warden.phase : 1,
    coreHp: world.coreHp,
    coreDestroyed: world.coreDestroyed,
    meltdownTicks: world.meltdownTicks,
    openDoors: [...world.openDoors],
    light: world.light,
    startX: world.level.spawn.x,
    startZ: world.level.spawn.z,
    rendererMode,
    ...tel,
  };
}

// Read-only test & showcase inspection hooks
const wAny = window as unknown as {
  __reanimator: () => ReturnType<typeof buildSnapshot>;
  __reanimatorAdvance: (inputs: Partial<InputState3D>[]) => ReturnType<typeof buildSnapshot>;
};

wAny.__reanimator = buildSnapshot;
wAny.__reanimatorAdvance = (inputs) => {
  manualHold = true;
  world = newWorld3D();
  acc = 0;
  flash = 0;
  releaseInput();
  show('playing');
  for (const inp of inputs) {
    world = stepWorld3D(world, { ...emptyInput3D(), ...inp });
    if (world.status !== 'playing') break;
  }
  renderWorld();
  hud();
  return buildSnapshot();
};

show('title');
requestAnimationFrame(frame);
