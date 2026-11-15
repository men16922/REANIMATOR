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
  getRunSummary3D,
  newWorld3D,
  RAIL_CHARGE_TICKS,
  respawnPlayer3D,
  stepWorld3D,
  WEAPON_META,
  type InputState3D,
  type WorldState3D,
} from '../game3d/world3d.ts';
import { fallbackScreenToWorld, renderFallback2D3D } from '../render3d/fallback2d.ts';
import { Scene3DRenderer } from '../render3d/scene3dFull.ts';
import { parseCrt, parseViewMode, PixelTransition, toggleViewMode, VIEW_STORE, viewLabel, type ViewMode } from '../render3d/classicView.ts';
import { ClassicHud } from './classicHud.ts';
import { getAudioDebug, play as playSound, setBgmVolume, setSfxVolume, setVolume, sfx } from './audio.ts';
import { rankPitch } from './audioLogic.ts';
import { AudioDirector, snapshotPre } from './audioDirector.ts';
import { Attract, freshWorld } from './attract.ts';
import { buildRunStats, formatClock, Onboarding, retryTip, SECTOR_SUBTITLE, type Hint } from './flow.ts';
import { labFields, labScenarios, plot, runCase, type LabCase } from './lab.ts';
import { collectMinimapMarkers, renderMinimap } from './minimap.ts';
import { buildLogoSvg } from './brand.ts';
import { objectiveFor } from './objective.ts';
import { parseGoreLevel, type GoreLevel } from '../render3d/gore3d.ts';
import { loadProgress, menuKeyAction, PANEL_IDS, stepIndex, type TitlePanel } from './menu.ts';
import { getFailedModelNames3D, getLoadedModelNames3D } from '../render3d/riggedModels.ts';

const SIM_HZ_3D = 60;
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('screen');
$('title-logo').innerHTML = buildLogoSvg('t');
$('loading-logo').innerHTML = buildLogoSvg('l');

// ---- loading screen: logo + progress while the 9 Meshy models load (polls the loader; never blocks) ----
{
  const MODEL_TOTAL = 9;
  const loading = $('loading');
  const started = performance.now();
  const timer = window.setInterval(() => {
    const l = getLoadedModelNames3D().length;
    const f = getFailedModelNames3D().length;
    const pr = loadProgress(l, f, MODEL_TOTAL);
    $('load-fill').style.width = `${Math.round(pr * 100)}%`;
    $('load-count').textContent = `${Math.min(l, MODEL_TOTAL)}/${MODEL_TOTAL}`;
    if (pr >= 1 || performance.now() - started > 12000 || !scene3d) {
      window.clearInterval(timer);
      loading.classList.add('done');
      window.setTimeout(() => { loading.hidden = true; focusDefault(); }, 520);
    }
  }, 80);
}

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
  reduceFlashP: $<HTMLInputElement>('reduce-flash-p'),
  goreLevel: $<HTMLSelectElement>('gore-level'),
  goreLevelP: $<HTMLSelectElement>('gore-level-p'),
  hpGhost: $('hp-ghost'),
  hpPill: $('hp-pill'),
  intro: $('intro'),
  sectorCard: $('sector-card'),
  pickupBanner: $('pickup-banner'),
  coach: $('coach'),
  controlsPanel: $('controls-panel'),
  rank: $('rank'),
};

// ---- persisted preferences (localStorage may be unavailable, e.g. private mode) ----
const STORE = { intro: 'reanimator.introSeen.v1', hints: 'reanimator.hints.v1', reduce: 'reanimator.reduceFlash.v1', gore: 'reanimator.goreLevel.v1', volume: 'reanimator.volume.v1' } as const;
function store(key: string, value?: string): string | null {
  try {
    if (value !== undefined) localStorage.setItem(key, value);
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}


type Mode = 'title' | 'playing' | 'paused' | 'result';
let mode: Mode = 'title';
let world: WorldState3D = freshWorld();
const attract = new Attract();
let deaths = 0;
let introActive = false;
let introTimer = 0;
let coachId = '';
let hitTimer = 0;
const onboarding = new Onboarding(((): string[] => {
  try {
    return JSON.parse(store(STORE.hints) ?? '[]') as string[];
  } catch {
    return [];
  }
})());
let onboardingSaved = onboarding.done.size;
/** Per-world observation for sector cards, pickup banners and weapon-switch animation. */
const seen = { world: null as WorldState3D | null, room: '' as string, logs: 0, secrets: 0, collected: 0, unlocked: '', weapon: 0 as number };
let acc = 0;
let last = 0;
let flash = 0;
let manualHold = false;
let mapExpanded = false;
/** Minimap '?' markers for unfound items and secrets (M toggles) */
let mapMarkers = true;
/** Metroid-style item freeze: seconds the display clock stays stopped after an upgrade pickup */
let itemFreeze = 0;
let bot: Bot3D | null = null;
const audioDirector = new AudioDirector();

const keys = new Set<string>();
const mouse = { ndcX: 0.28, ndcY: 0.08, normX: 0.64, normY: 0.46, leftDown: false, rightDown: false };
let lightQueued = false;
let dashQueued = false;
let interactQueued = false;
let weaponQueue: WeaponSlot3D | 0 = 0;

function cycleWeapon(dir: 1 | -1): void {
  const unlocked = ([1, 2, 3, 4, 5, 6] as WeaponSlot3D[]).filter((s) => world.player.unlocked[s]);
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
  const input: InputState3D = {
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
  onboarding.observe(input);
  return input;
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
  ui.controlsPanel.hidden = true;
  $('lab').hidden = true;
  for (const id of Object.values(PANEL_IDS)) $(id).hidden = true;
  $('continue').hidden = !(m === 'title' && !!world.lastSaveId);
  if (m === 'title') hideTransient();
  audioDirector.syncBeds(world, m === 'playing', m);
  if (m === 'playing') canvas.focus();
  else focusDefault();
}

/** Keyboard-first menus: land focus on the primary action of the visible screen. */
function focusDefault(): void {
  const openPanel = openTitlePanel();
  const target = mode === 'title' ? (openPanel?.querySelector<HTMLElement>('button, input') ?? $('play')) : mode === 'paused' ? $('resume') : mode === 'result' ? ($('resume-save').hidden ? $('restart') : $('resume-save')) : null;
  target?.focus({ preventScroll: true });
}

/** Title sub-panel (settings / extras / controls) currently open, if any. */
function openTitlePanel(): HTMLElement | null {
  for (const id of Object.values(PANEL_IDS)) if (!$(id).hidden) return $(id);
  return null;
}

function openPanelFor(name: TitlePanel, focusId: string): void {
  for (const id of Object.values(PANEL_IDS)) $(id).hidden = true;
  $(PANEL_IDS[name]).hidden = false;
  $(focusId).focus({ preventScroll: true });
}

function closeTitlePanel(returnFocus: string): void {
  for (const id of Object.values(PANEL_IDS)) $(id).hidden = true;
  $(returnFocus).focus({ preventScroll: true });
}

function hideTransient(): void {
  for (const el of [ui.sectorCard, ui.pickupBanner, ui.coach]) {
    el.hidden = true;
    el.classList.remove('show');
  }
  coachId = '';
}

function start(forceIntro = false): void {
  manualHold = false;
  world = freshWorld();
  audioDirector.reset();
  bot = null;
  acc = 0;
  flash = 0;
  scene3d?.fx.reset();
  deaths = 0;
  seen.world = null;
  hideTransient();
  releaseInput();
  show('playing');
  // Automation skips only the automatic first-run intro; an explicit 'Watch intro' always plays.
  if (forceIntro || (store(STORE.intro) !== '1' && !navigator.webdriver)) showIntro();
}

// ---- intro (first run only, skippable, under 10 s) ----
function showIntro(): void {
  store(STORE.intro, '1');
  introActive = true;
  ui.intro.hidden = false;
  // Re-trigger the CSS timeline: clone the node's animation by toggling a reflow.
  ui.intro.style.animation = 'none';
  void ui.intro.offsetWidth;
  ui.intro.style.animation = '';
  for (const el of ui.intro.querySelectorAll<HTMLElement>('.lid, p')) {
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = '';
  }
  window.clearTimeout(introTimer);
  introTimer = window.setTimeout(hideIntro, 9800);
}

function hideIntro(): void {
  if (!introActive) return;
  introActive = false;
  window.clearTimeout(introTimer);
  ui.intro.hidden = true;
  seen.room = ''; // let the sector card appear now that the intro is gone
}

function applyReduceFx(on: boolean): void {
  document.body.classList.toggle('reduce-fx', on);
  ui.reduceFlash.checked = on;
  ui.reduceFlashP.checked = on;
  store(STORE.reduce, on ? '1' : '0');
}

let goreLevel: GoreLevel = parseGoreLevel(store(STORE.gore));
function applyGore(level: GoreLevel): void {
  goreLevel = level;
  ui.goreLevel.value = level;
  ui.goreLevelP.value = level;
  store(STORE.gore, level);
}

// ---- Classic View (1996 look): V toggles, SETTINGS buttons mirror it, both persisted ----
let viewMode: ViewMode = 'modern';
let crtOn = false;
const classicHud = new ClassicHud(ui.hud);
const viewFx = new PixelTransition(canvas);

function syncViewButtons(): void {
  $('view-toggle').textContent = `View: ${viewLabel(viewMode)}`;
  $('crt-toggle').textContent = `CRT: ${crtOn ? 'On' : 'Off'}`;
}

function applyView(m: ViewMode, persist = true): void {
  viewMode = m;
  document.body.classList.toggle('classic', m === 'classic');
  scene3d?.setViewMode(m);
  if (persist) store(VIEW_STORE.mode, m);
  syncViewButtons();
}

function applyCrt(on: boolean, persist = true): void {
  crtOn = on;
  scene3d?.setCrt(on);
  if (persist) store(VIEW_STORE.crt, on ? '1' : '0');
  syncViewButtons();
}

/** 1996 <-> 2026 with the 0.4 s mosaic. Reduced-flash mode switches instantly. */
function toggleView(): void {
  if (viewFx.active) return;
  const target = toggleViewMode(viewMode);
  if (ui.reduceFlash.checked) {
    applyView(target);
    return;
  }
  viewFx.start(target, () => applyView(target), performance.now());
  // Safety net if frames stop rendering (e.g. a hidden tab): finish the switch anyway.
  window.setTimeout(() => {
    if (viewMode !== target) applyView(target);
    viewFx.finish();
  }, 900);
}

function popClass(el: HTMLElement, cls: string, ms: number, timerKey?: 'hit'): void {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
  if (timerKey === 'hit') {
    window.clearTimeout(hitTimer);
    hitTimer = window.setTimeout(() => el.classList.remove(cls), ms);
  }
}

function showSectorCard(): void {
  const r = world.level.rooms.find((x) => x.sector === world.currentRoom);
  if (!r) return;
  const idx = world.level.rooms.indexOf(r) + 1;
  $('sc-eyebrow').textContent = `SECTOR ${String(idx).padStart(2, '0')}`;
  $('sc-name').textContent = r.name.toUpperCase();
  $('sc-sub').textContent = SECTOR_SUBTITLE[r.sector] ?? r.hint;
  ui.sectorCard.hidden = false;
  popClass(ui.sectorCard, 'show', 0);
  playSound('ui.sector');
}

const WEAPON_BANNER: Record<number, { title: string; desc: string }> = {
  2: { title: 'SCATTERGUN', desc: 'Wide spread. Opens green locks. Press 2 to equip.' },
  3: { title: 'GRENADE LAUNCHER', desc: 'Splash damage. Opens yellow locks and Cracked Bio-Walls. Press 3 to equip.' },
  4: { title: 'RAIL-CANNON', desc: 'Heavy shot. Opens red locks once the Security Console is armed. Press 4 to equip.' },
  5: { title: 'FLAMER', desc: 'Short cone of fire that sets enemies burning. Strong on crawlers and nests, weak on the Warden. Press 5 to equip.' },
  6: { title: 'ROCKET LAUNCHER', desc: 'Slow, accelerating rocket with a big blast. Fire it near your feet for a small rocket jump. Press 6 to equip.' },
};
const UPGRADE_BANNER: Record<string, { title: string; desc: string }> = {
  thruster_boots: { title: 'THRUSTER BOOTS', desc: 'Press jump again in mid-air for a second jump. Reach the high ledge in the Central Shaft.' },
  energy_tank: { title: 'ENERGY TANK', desc: 'Maximum hull +30. Hull fully restored.' },
  crawl_slide: { title: 'CRAWL SLIDE', desc: 'Hold S and press Shift on the ground to slide under low tunnels. Look for 1 m ducts marked with hazard stripes.' },
  ammo_expansion: { title: 'AMMO EXPANSION', desc: 'Save stations now recharge 50% more ammo. Reserves topped up.' },
};
/** Seconds of display freeze per pickup kind (the simulation does not advance, so replays stay deterministic) */
const ITEM_FREEZE_S = 0.85;

function showPickupBanner(b: { title: string; desc: string }): void {
  $('pb-title').textContent = b.title;
  $('pb-desc').textContent = b.desc;
  ui.pickupBanner.hidden = false;
  popClass(ui.pickupBanner, 'show', 0);
  playSound('ui.banner');
}

/** Detects sector changes, new pickups and weapon switches by diffing against the last frame. */
function observeWorld(): void {
  const p = world.player;
  const unlocked = ([1, 2, 3, 4, 5, 6] as const).map((s) => (p.unlocked[s] ? '1' : '0')).join('');
  if (seen.world !== world) {
    seen.world = world;
    seen.room = '';
    seen.collected = world.collectedUpgrades.size;
    seen.logs = world.collectibles.filter((l) => l.taken).length;
    seen.secrets = world.secretsFound.length;
    seen.unlocked = unlocked;
    seen.weapon = p.weapon;
  }
  if (mode !== 'playing' || manualHold) return;
  if (seen.room !== world.currentRoom && !introActive) {
    seen.room = world.currentRoom;
    showSectorCard();
  }
  if (world.collectedUpgrades.size !== seen.collected) {
    if (world.collectedUpgrades.size > seen.collected) {
      const last = [...world.collectedUpgrades].pop();
      const kind = world.level.upgrades.find((u) => u.id === last)?.kind;
      if (kind && UPGRADE_BANNER[kind]) {
        showPickupBanner(UPGRADE_BANNER[kind]);
        itemFreeze = ITEM_FREEZE_S;
        // Fanfare: the simulation already played world.upgrade, the banner plays ui.banner, this adds the rising stinger
        setTimeout(() => playSound('ui.rank', { pitch: rankPitch('A') }), 260);
      }
    }
    seen.collected = world.collectedUpgrades.size;
  }
  const logsNow = world.collectibles.filter((l) => l.taken);
  if (logsNow.length !== seen.logs) {
    if (logsNow.length > seen.logs) {
      const lg = logsNow[logsNow.length - 1];
      showPickupBanner({ title: `DATA LOG ${logsNow.length}/${world.collectibles.length}`, desc: lg.title });
    }
    seen.logs = logsNow.length;
  }
  if (world.secretsFound.length !== seen.secrets) {
    if (world.secretsFound.length > seen.secrets) {
      const sr = world.level.secrets.find((x) => x.id === world.secretsFound[world.secretsFound.length - 1]);
      showPickupBanner({ title: 'SECRET FOUND', desc: sr ? sr.name : 'Hidden room' });
    }
    seen.secrets = world.secretsFound.length;
  }
  if (unlocked !== seen.unlocked) {
    for (const s of [2, 3, 4, 5, 6] as const) {
      if (unlocked[s - 1] === '1' && seen.unlocked[s - 1] === '0') showPickupBanner(WEAPON_BANNER[s]);
    }
    seen.unlocked = unlocked;
  }
  if (seen.weapon !== p.weapon) {
    seen.weapon = p.weapon;
    popClass($(`wpn-${p.weapon}`), 'switch', 0);
  }
}

function updateCoach(): void {
  const hint: Hint | null = mode === 'playing' && !manualHold && !introActive ? onboarding.update(world) : null;
  if (onboarding.done.size !== onboardingSaved) {
    onboardingSaved = onboarding.done.size;
    store(STORE.hints, JSON.stringify([...onboarding.done]));
  }
  const id = hint?.id ?? '';
  if (id === coachId) return;
  coachId = id;
  if (!hint) {
    ui.coach.hidden = true;
    return;
  }
  const keysEl = $('coach-keys');
  keysEl.textContent = '';
  for (const k of hint.keys) {
    const kb = document.createElement('kbd');
    kb.textContent = k;
    keysEl.append(kb);
  }
  $('coach-text').textContent = hint.text;
  ui.coach.hidden = false;
  popClass(ui.coach, 'coach-pop', 0);
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
    revealedRooms: new Set(L.rooms.filter((r) => world.mapRevealed.includes(r.sector)).map((r) => r.id)),
    markers: collectMinimapMarkers(world),
    showMarkers: mapMarkers,
    mapStations: L.mapStations,
  });
}

function hud(): void {
  const p = world.player;
  ui.hp.textContent = String(p.hp);
  const hpPct = `${Math.max(0, Math.min(100, (p.hp / p.maxHp) * 100))}%`;
  ui.hpBar.style.width = hpPct;
  ui.hpGhost.style.width = hpPct;
  ui.hpPill.classList.toggle('low', p.hp > 0 && p.hp / p.maxHp <= 0.3);
  ui.hpBar.style.background = p.hp > 60 ? '#3dff88' : p.hp > 30 ? '#f5b942' : '#ff4757';

  const dashPct = ((ABILITY_3D.dashCooldownTicks - p.body.dashCooldown) / ABILITY_3D.dashCooldownTicks) * 100;
  ui.dashBar.style.width = `${Math.max(0, Math.min(100, dashPct))}%`;

  ui.battery.style.width = `${Math.max(0, Math.min(100, (world.light.battery / LIGHT.max) * 100))}%`;
  ui.battery.style.background = world.light.on ? '#f6e27a' : '#7d7340';
  ui.kills.textContent = String(p.kills);
  ui.time.textContent = `${(world.tick / SIM_HZ_3D).toFixed(1)}s`;

  // Objective & Meltdown
  const obj = objectiveFor(world);
  ui.objective.textContent = obj.text;
  ui.objective.style.color = obj.color;

  if (world.meltdownTicks >= 0) {
    ui.meltdown.hidden = false;
    ui.meltdownTime.textContent = `${(world.meltdownTicks / SIM_HZ_3D).toFixed(1)}s`;
  } else {
    ui.meltdown.hidden = true;
  }

  // 6-Weapon Hotbar
  for (const s of [1, 2, 3, 4, 5, 6] as WeaponSlot3D[]) {
    const el = $(`wpn-${s}`);
    const ammoEl = $(`ammo-${s}`);
    const unlocked = p.unlocked[s];
    el.classList.toggle('active', p.weapon === s);
    el.classList.toggle('locked', !unlocked);
    ammoEl.textContent = s === 1 ? 'INF' : unlocked ? String(p.ammo[s]) : '--';
  }

  const zm = zoneMeta();
  ui.sector.textContent = zm.name;
  if (viewMode === 'classic') {
    classicHud.update({
      hp: p.hp,
      maxHp: p.maxHp,
      energyTanks: p.energyTanks,
      weapon: p.weapon,
      unlocked: [p.unlocked[1], p.unlocked[2], p.unlocked[3], p.unlocked[4], p.unlocked[5], p.unlocked[6]],
      ammo: [-1, p.ammo[2], p.ammo[3], p.ammo[4], p.ammo[5], p.ammo[6]],
      kills: p.kills,
      sector: zm.name,
    });
  }
  ui.sectorHint.textContent = world.hintTicks > 0 ? world.hint : zm.hint;
  const cb = world.combo;
  $('combo-pill').hidden = cb.count < 2;
  if (cb.count >= 2) $('combo-count').textContent = `x${cb.count}`;
  const railOn = p.weapon === 4 && p.railCharge > 0;
  $('rail-pill').hidden = !railOn;
  if (railOn) $('rail-bar').style.width = `${Math.min(100, (p.railCharge / RAIL_CHARGE_TICKS) * 100)}%`;
  ui.bootsPill.hidden = !p.abilities.thrusterBoots;
  ui.etankCount.textContent = `${p.energyTanks}/${world.level.upgrades.filter((u) => u.kind === 'energy_tank').length}`;
  drawMinimap();

  const warden = world.enemies.find((e) => e.kind === 'warden');
  const showBoss = Boolean(warden && warden.alive && world.currentRoom === 'core');
  ui.wardenHud.hidden = !showBoss;
  if (showBoss && warden) {
    ui.wardenHp.style.width = `${Math.max(0, Math.min(100, (warden.hp / warden.maxHp) * 100))}%`;
    $('warden-exposed').hidden = warden.exposedTicks <= 0;
    ui.wardenPhase.textContent = warden.phase === 3 ? 'PHASE III' : warden.phase === 2 ? 'PHASE II' : 'PHASE I';
  }

  ui.damageFlash.style.opacity = ui.reduceFlash.checked ? '0' : String(Math.min(0.85, flash));
}

function renderWorld(alpha = 1): void {
  if (scene3d) {
    scene3d.render(world, alpha);
  } else {
    renderFallback2D3D(canvas, world);
  }
  viewFx.afterRender(performance.now());
}

function handlePostStepAudio(pre: ReturnType<typeof snapshotPre>): void {
  scene3d?.fx.observe(world);
  if (world.player.hp < pre.hp) {
    flash = 1;
    if (!ui.reduceFlash.checked) popClass(ui.hud, 'hit', 340, 'hit');
  }
  audioDirector.afterStep(world, pre);
}

function showResult(): void {
  const won = world.status === 'won';
  if (!won) {
    deaths++;
    sfx.lose();
  }
  const st = buildRunStats(world, deaths, SIM_HZ_3D);
  const canResume = !won && !!world.lastSaveId;
  ui.resultTitle.textContent = won ? 'Escaped with the core' : 'Signal lost';
  const cp = won ? '' : canResume ? 'Press C or Enter to resume at the last Save station.' : 'No Save station reached yet. Play again restarts the run.';
  ui.resultDetail.textContent = `Weapon [${WEAPON_META[world.player.weapon].name}]${cp ? ' · ' + cp : ''}`;
  $('rs-time').textContent = formatClock(st.seconds);
  $('rs-kills').textContent = String(st.kills);
  $('rs-deaths').textContent = String(st.deaths);
  $('rs-collect').textContent = `${st.collectionPct}%`;
  ui.rank.hidden = !won;
  ui.rank.textContent = st.rank;
  ui.rank.className = `rank r-${st.rank}`;
  if (won) setTimeout(() => playSound('ui.rank', { pitch: rankPitch(st.rank) }), 450);
  $('result-tip').textContent = won ? '' : retryTip(deaths);
  $('result-tip').hidden = won;
  ui.result.classList.toggle('won', won);
  ui.result.classList.toggle('lost', !won);
  $('resume-save').hidden = !canResume;
  show('result');
}

function frame(t: number): void {
  const dt = Math.min(0.1, (t - last) / 1000 || 1 / 60);
  last = t;
  const fx = scene3d?.fx;
  let frozen = false;
  if (mode === 'playing' && !manualHold) {
    // Hit-stop and kill slow-motion only retime the display clock. Every simulation tick still runs, in order.
    frozen = fx ? fx.hitstop.step() : false;
    if (itemFreeze > 0) {
      itemFreeze = Math.max(0, itemFreeze - dt);
      frozen = true;
    }
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
        showResult();
        break;
      }
    }
    if (!frozen) flash = Math.max(0, flash - dt * 3.2);
  }
  if (scene3d) {
    scene3d.reduceMotion = ui.reduceFlash.checked;
    scene3d.fx.gore.level = goreLevel;
    scene3d.fxTimeScale = frozen ? 0 : fx ? fx.slowmo.scale : 1;
  }
  if (mode === 'title') {
    // Attract mode: a bot plays a private world behind the title. Never touches `world` or human input.
    if (attract.advance(dt)) scene3d?.fx.reset();
    scene3d?.setAttractCamera(attract.time, attract.shot);
    canvas.style.opacity = String(1 - attract.fade * 0.96);
    if (scene3d) scene3d.render(attract.world, attract.alpha);
    else renderFallback2D3D(canvas, attract.world);
    viewFx.afterRender(performance.now());
  } else {
    scene3d?.setAttractCamera(null);
    if (canvas.style.opacity) canvas.style.opacity = '';
    renderWorld(mode === 'playing' && !manualHold ? Math.min(1, acc * SIM_HZ_3D) : 1);
    hud();
    observeWorld();
    updateCoach();
  }
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
const NON_START_KEYS = new Set(['Tab', 'Escape', 'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight', 'CapsLock']);

/** Topmost visible menu container, used for keyboard focus navigation. */
function activeMenu(): HTMLElement {
  for (const el of [$('lab'), ui.revived, ui.controlsPanel]) if (!el.hidden) return el;
  if (mode === 'title') return openTitlePanel() ?? ui.title;
  return mode === 'paused' ? ui.pause : ui.result;
}

function closeSubPanels(): boolean {
  const tp = openTitlePanel();
  if (!$('lab').hidden) $('lab').hidden = true;
  else if (!ui.revived.hidden) ui.revived.hidden = true;
  else if (!ui.controlsPanel.hidden) ui.controlsPanel.hidden = true;
  else if (tp) {
    // Controls opens from Extras, so it goes back there; everything else returns to the main menu.
    if (tp.id === PANEL_IDS.controls) return openPanelFor('extras', 'title-controls-open'), true;
    if (tp.id === PANEL_IDS.credits) return openPanelFor('extras', 'credits-open'), true;
    closeTitlePanel(tp.id === PANEL_IDS.extras ? 'extras-open' : 'settings-open');
    return true;
  } else return false;
  if (tp) return $(tp.id === PANEL_IDS.extras ? 'lab-open' : 'play').focus({ preventScroll: true }), true;
  focusDefault();
  return true;
}

function menuNavigate(e: KeyboardEvent): boolean {
  const act = menuKeyAction(e.code);
  if (act !== 'next' && act !== 'prev') return false;
  const cur = document.activeElement as HTMLElement | null;
  if (cur && /^(SELECT|TEXTAREA)$/.test(cur.tagName)) return false;
  // Sliders keep Left/Right for their value, so Up/Down may leave them.
  const items = [...activeMenu().querySelectorAll<HTMLElement>('button, input[type="checkbox"], input[type="range"]')].filter((el) => el.offsetParent !== null);
  if (items.length === 0) return false;
  const i = cur ? items.indexOf(cur) : -1;
  const next = items[stepIndex(i, act === 'next' ? 1 : -1, items.length)];
  next.focus();
  e.preventDefault();
  return true;
}

window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyV' && !e.repeat && !e.metaKey && !e.ctrlKey && !e.altKey && $('loading').hidden) {
    toggleView();
    e.preventDefault();
    return;
  }
  if (introActive) {
    hideIntro();
    if (mode === 'title') {
      e.preventDefault();
      return;
    }
    if (e.code === 'Escape') return;
  }
  if (mode === 'title') {
    if (e.code === 'Escape' && closeSubPanels()) {
      e.preventDefault();
      return;
    }
    if (menuNavigate(e)) return;
    const t = e.target as HTMLElement | null;
    const interactive = !!t && /^(BUTTON|INPUT|SELECT|TEXTAREA)$/.test(t.tagName);
    const panelOpen = !$('lab').hidden || !ui.revived.hidden || !!openTitlePanel();
    if (!interactive && !panelOpen && $('loading').hidden && !NON_START_KEYS.has(e.code) && !e.metaKey && !e.ctrlKey && !e.altKey && !e.repeat && !/^F\d+$/.test(e.code)) {
      e.preventDefault();
      start();
    }
    return;
  }
  if (mode === 'paused' && e.code === 'Escape' && !ui.controlsPanel.hidden) {
    closeSubPanels();
    e.preventDefault();
    return;
  }
  if (mode !== 'playing' && menuNavigate(e)) return;
  if (mode === 'result' && e.code === 'KeyR') {
    start();
    e.preventDefault();
    return;
  }
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
  if (e.code === 'Digit5' && !e.repeat) weaponQueue = 5;
  if (e.code === 'Digit6' && !e.repeat) weaponQueue = 6;
  if (e.code === 'KeyQ' && !e.repeat) cycleWeapon(1);
  if (e.code === 'KeyR' && !e.repeat) start();
  if (e.code === 'KeyM' && !e.repeat) mapMarkers = !mapMarkers;
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

// Menu sounds: focus moves tick, buttons confirm, back/close/resume buttons use the back tone
document.addEventListener('focusin', (e) => {
  if (mode !== 'playing' && (e.target as HTMLElement | null)?.closest?.('button')) playSound('ui.move');
});
document.addEventListener('click', (e) => {
  const b = (e.target as HTMLElement | null)?.closest?.('button');
  if (!b || mode === 'playing') return;
  playSound(/close|resume$|^resume$/.test(b.id) ? 'ui.back' : 'ui.select');
});
$('play').addEventListener('click', () => start());
$('intro-skip').addEventListener('click', hideIntro);
window.addEventListener('pointerdown', () => hideIntro());
$('intro-open').addEventListener('click', () => start(true));
$('settings-open').addEventListener('click', () => openPanelFor('settings', 'reduce-flash'));
$('settings-close').addEventListener('click', () => closeTitlePanel('settings-open'));
$('extras-open').addEventListener('click', () => openPanelFor('extras', 'title-controls-open'));
$('extras-close').addEventListener('click', () => closeTitlePanel('extras-open'));
$('title-controls-open').addEventListener('click', () => openPanelFor('controls', 'title-controls-close'));
$('title-controls-close').addEventListener('click', () => openPanelFor('extras', 'title-controls-open'));
$('credits-open').addEventListener('click', () => openPanelFor('credits', 'credits-close'));
$('credits-close').addEventListener('click', () => openPanelFor('extras', 'credits-open'));
$('continue').addEventListener('click', () => {
  if (!world.lastSaveId) return;
  respawnPlayer3D(world);
  scene3d?.fx.reset();
  audioDirector.reset();
  releaseInput();
  show('playing');
});
// Mouse hover moves the menu selection, same as the keyboard.
for (const b of document.querySelectorAll<HTMLElement>('#title button.mi')) b.addEventListener('mouseenter', () => b.focus({ preventScroll: true }));
$('controls-open').addEventListener('click', () => {
  ui.controlsPanel.hidden = false;
  $('controls-close').focus();
});
$('controls-close').addEventListener('click', () => {
  ui.controlsPanel.hidden = true;
  $('controls-open').focus();
});
$('view-toggle').addEventListener('click', toggleView);
$('crt-toggle').addEventListener('click', () => applyCrt(!crtOn));
applyView(parseViewMode(store(VIEW_STORE.mode)), false);
applyCrt(parseCrt(store(VIEW_STORE.crt)), false);
for (const el of [ui.reduceFlash, ui.reduceFlashP]) el.addEventListener('change', () => applyReduceFx(el.checked));
for (const el of [ui.goreLevel, ui.goreLevelP]) el.addEventListener('change', () => applyGore(parseGoreLevel(el.value)));
applyGore(goreLevel);
applyReduceFx(store(STORE.reduce) === '1' || window.matchMedia('(prefers-reduced-motion: reduce)').matches);
for (const id of ['volume', 'volume-p']) {
  const el = $<HTMLInputElement>(id);
  el.addEventListener('input', () => {
    setVolume(Number(el.value) / 100);
    store(STORE.volume, el.value);
    for (const other of ['volume', 'volume-p']) $<HTMLInputElement>(other).value = el.value;
  });
}
{
  const saved = store(STORE.volume);
  if (saved !== null && Number.isFinite(Number(saved))) {
    for (const id of ['volume', 'volume-p']) $<HTMLInputElement>(id).value = saved;
    setVolume(Number(saved) / 100);
  }
}
$<HTMLInputElement>('volume-bgm').addEventListener('input', (e) => setBgmVolume(Number((e.target as HTMLInputElement).value) / 100));
$<HTMLInputElement>('volume-sfx').addEventListener('input', (e) => setSfxVolume(Number((e.target as HTMLInputElement).value) / 100));
$('restart').addEventListener('click', () => start());
$('resume-save').addEventListener('click', () => { resumeAtSave(); });
$('restart-p').addEventListener('click', () => start());
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
    : { modelsLoaded: false, loadedModels: [], failedModels: [], riggedCount: 0, activeAnimations: {}, fx: null, player: null, enemyRender: {} as Record<string, { yaw: number; clip: string; timeScale: number; x: number; y: number; z: number }> };
  const b = world.player.body;
  return {
    lab: lab ? { id: lab.scenario.id, status: lab.status, mutation: lab.mutation } : null,
    mode,
    intro: introActive,
    combo: { ...world.combo },
    run: { ...world.run },
    completion: getRunSummary3D(world).completionPercent,
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
    sliding: b.sliding,
    mapRevealed: [...world.mapRevealed],
    ammoExpansions: world.player.ammoExpansions,
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
    viewMode,
    crt: crtOn,
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
  /** Debug: grant the Crawl Slide module */
  slide?: boolean;
  /** Debug: reactor already destroyed, this many meltdown ticks left (escape sequence beats, final hatch) */
  meltdownTicks?: number;
  openDoors?: string[];
  console?: boolean;
  hp?: number;
  aimX?: number;
  aimY?: number;
  /** Debug: force the Core Warden to phase 1|2|3 (sets HP just inside the phase). */
  bossPhase?: 1 | 2 | 3;
  /** Debug: mark the Warden intro as already played (no cinematic). */
  skipIntro?: boolean;
}

function applyDebugSetup(w: WorldState3D, o: DebugSetup3D): void {
  const p = w.player;
  if (o.x !== undefined || o.y !== undefined) {
    p.body = spawnBody3D(o.x ?? p.body.x, o.y ?? p.body.y, 0);
  }
  if (o.boots) p.abilities.thrusterBoots = true;
  if (o.slide) p.abilities.crawlSlide = true;
  if (o.meltdownTicks !== undefined) {
    w.coreDestroyed = true;
    w.coreHp = 0;
    w.phase = 'escape';
    w.openDoors.add('door_escape');
    w.meltdownTicks = o.meltdownTicks;
    const wd = w.enemies.find((e) => e.kind === 'warden' && !e.minion);
    if (wd) {
      wd.alive = false;
      wd.hp = 0;
    }
  }
  if (o.tanks !== undefined) {
    p.energyTanks = o.tanks;
    p.maxHp = 100 + 30 * o.tanks;
    p.hp = p.maxHp;
  }
  for (const s of o.weapons ?? []) {
    p.unlocked[s] = true;
    if (s !== 1) p.ammo[s as 2 | 3 | 4 | 5 | 6] = WEAPON_META[s].initialAmmo;
  }
  for (const d of o.openDoors ?? []) w.openDoors.add(d);
  if (o.console) w.consoleUnlocked = true;
  if (o.hp !== undefined) p.hp = o.hp;
  if (o.aimX !== undefined) p.aimX = o.aimX;
  if (o.aimY !== undefined) p.aimY = o.aimY;
  if (o.skipIntro) w.bossIntroDone = true;
  if (o.bossPhase) {
    const wd = w.enemies.find((e) => e.kind === 'warden' && !e.minion);
    if (wd) {
      wd.phase = o.bossPhase;
      wd.hp = Math.floor(wd.maxHp * (o.bossPhase === 1 ? 0.95 : o.bossPhase === 2 ? 0.6 : 0.28));
    }
  }
}

// Read-only test & showcase inspection hooks
const wAny = window as unknown as {
  __reanimator: () => ReturnType<typeof buildSnapshot>;
  __reanimatorAdvance: (inputs: Partial<InputState3D>[], setup?: DebugSetup3D) => ReturnType<typeof buildSnapshot>;
  __reanimatorStep: (inputs: Partial<InputState3D>[], alpha?: number) => ReturnType<typeof buildSnapshot>;
  __reanimatorRunBot: (maxTicks: number, untilStep?: string, showResultOnEnd?: boolean) => ReturnType<typeof buildSnapshot>;
  __reanimatorSetView: (m: ViewMode) => ReturnType<typeof buildSnapshot>;
  __reanimatorAudio: typeof getAudioDebug;
  __reanimatorShowResult: (kind: 'won' | 'lost') => ReturnType<typeof buildSnapshot>;
  __reanimatorShowBanner: (kind: 'sector' | 'weapon' | 'boots' | 'etank' | 'coach') => ReturnType<typeof buildSnapshot>;
  __reanimatorPick: (px: number, py: number, includePoints?: boolean) => Array<Record<string, unknown>>;
};

function enterManual(): void {
  // Leave attract mode first: a stale attract camera makes the next render skip the Warden intro (debug entry points).
  scene3d?.setAttractCamera(null);
  manualHold = true;
  acc = 0;
  flash = 0;
  releaseInput();
  show('playing');
}

wAny.__reanimator = buildSnapshot;
/** Debug: audio graph state, current theme, voice counters and the last 48 sound ids (see docs). */
wAny.__reanimatorAudio = getAudioDebug;
/** Debug only: switch view immediately, without the mosaic transition. */
wAny.__reanimatorSetView = (m) => {
  applyView(m === 'classic' ? 'classic' : 'modern');
  return buildSnapshot();
};
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
wAny.__reanimatorRunBot = (maxTicks, untilStep, showResultOnEnd = false) => {
  enterManual();
  if (!bot) bot = createBot3D(world);
  for (let i = 0; i < maxTicks && world.status === 'playing'; i++) {
    if (untilStep && bot.stepLabel === untilStep) break;
    world = stepWorld3D(world, bot.next(world));
  }
  scene3d?.fx.observe(world, true);
  renderWorld();
  hud();
  if (showResultOnEnd && world.status !== 'playing') showResult();
  return buildSnapshot();
};

/**
 * Debug only: force the result screen. 'won' / 'lost' mark the current world finished (status only, nothing else
 * is changed) and run the same showResult() path as real play.
 */
wAny.__reanimatorShowResult = (kind) => {
  enterManual();
  world.status = kind;
  if (kind === 'won') world.phase = 'won';
  hud();
  showResult();
  return buildSnapshot();
};

/** Debug only: pop a HUD banner or card deterministically ('sector', 'weapon', 'boots', 'etank', 'coach'). */
wAny.__reanimatorShowBanner = (kind) => {
  enterManual();
  hud();
  if (kind === 'sector') showSectorCard();
  else if (kind === 'weapon') showPickupBanner(WEAPON_BANNER[2]);
  else if (kind === 'boots') showPickupBanner(UPGRADE_BANNER.thruster_boots);
  else if (kind === 'etank') showPickupBanner(UPGRADE_BANNER.energy_tank);
  else {
    const c = $('coach');
    c.hidden = false;
    c.classList.add('show');
    c.textContent = 'RUN  [A] [D]';
  }
  return buildSnapshot();
};

/** Debug only: list meshes under a CSS-pixel viewport point, nearest first. */
wAny.__reanimatorPick = (px, py, includePoints = false) => scene3d?.pickAt(px, py, includePoints) ?? [];

show('title');
requestAnimationFrame(frame);
