// Browser shell: fixed-rate 60 Hz Full 3D side-view Metroidvania simulation,
// Three.js WebGL2 renderer (with Canvas2D fallback), 4-weapon switching, sector minimap, WebAudio SFX,
// preserved 15 Hz DOS Restoration Lab, and smoke/showcase inspection hooks.

import { ABILITY_3D } from '../engine/motion3d.ts';
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
  setAssist3D,
  stepWorld3D,
  WEAPON_META,
  type AssistOptions3D,
  type Difficulty3D,
  type InputState3D,
  type WorldState3D,
} from '../game3d/world3d.ts';
import { assistAim, difficultyNote, displayClock, parseAssist, parseDifficulty, stepAutoFire } from '../game3d/assist.ts';
import { fallbackScreenToWorld, renderFallback2D3D } from '../render3d/fallback2d.ts';
import { Scene3DRenderer } from '../render3d/scene3dFull.ts';
import { parseCrt, parseViewMode, PixelTransition, toggleViewMode, VIEW_STORE, viewLabel, type ViewMode } from '../render3d/classicView.ts';
import { ClassicHud } from './classicHud.ts';
import { getAudioDebug, play as playSound, playFanfare, setBgmVolume, setSfxVolume, setVolume, sfx } from './audio.ts';
import { rankPitch } from './audioLogic.ts';
import { AudioDirector, snapshotPre } from './audioDirector.ts';
import { Attract, freshWorld, REEL_SEGMENT_SECONDS, Showcase } from './attract.ts';
import { applyDebugSetup, DEMO_STOPS, SHOWCASE_NAMES, SHOWCASE_SCENES, type DebugSetup3D, type DemoStop } from './demo.ts';
import { OPENING_BEATS, OPENING_ENEMY_ID, OPENING_VENT, OpeningClock, openingView } from './opening.ts';
import { buildRunStats, formatClock, Onboarding, retryTip, type Hint } from './flow.ts';
import { initLab } from './labView.ts';
import { collectMinimapMarkers, renderMinimap } from './minimap.ts';
import { buildLogoSvg } from './brand.ts';
import { meltdownPillVisible, objectiveFor } from './objective.ts';
import { parseGoreLevel, type GoreLevel } from '../render3d/gore3d.ts';
import { loadProgress, menuKeyAction, PANEL_IDS, stepIndex, type TitlePanel } from './menu.ts';
import { normalizePanelState, titleCovered, topLayer } from './panels.ts';
import { archiveRows, canOpen, LOG_FREEZE_S, openReader, pressReader, tickReader, visibleBody, type ReaderState } from './logReader.ts';
import { CREDITS_LINES, endingText, INTRO_LINES, LANG_STORE_KEY, LORE_LOGS, LORE_UI, loreLogById, otherLang, pickLang, SECTOR_SUB, type Lang } from './lore.ts';
import { runUiAudit, type UiAuditReport } from './uiAudit.ts';
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

// WebGL context loss: the renderer pauses drawing and the browser usually restores the context within a moment.
// A canvas that already has a WebGL context cannot switch to 2D, so if it stays lost we ask for a reload.
const gpuNotice = document.createElement('div');
gpuNotice.id = 'gpu-notice';
gpuNotice.setAttribute('role', 'alert');
gpuNotice.hidden = true;
gpuNotice.style.cssText = 'position:fixed;left:50%;top:14%;transform:translateX(-50%);z-index:60;padding:10px 18px;background:rgba(10,14,20,.92);color:#ffd9a0;border:1px solid #ff9d2e;font:600 14px/1.4 system-ui,sans-serif;text-align:center;pointer-events:none';
document.body.appendChild(gpuNotice);
let gpuTimer = 0;
if (scene3d) {
  scene3d.onContextChange = (lost) => {
    window.clearTimeout(gpuTimer);
    gpuNotice.hidden = !lost;
    if (lost) {
      gpuNotice.textContent = 'Graphics context lost. Restoring…';
      gpuTimer = window.setTimeout(() => {
        gpuNotice.textContent = 'Graphics context was not restored. Reload the page to continue.';
      }, 5000);
    }
  };
}

// Frame budget telemetry (localhost or ?perf): CPU milliseconds for simulation, fx, draw submission, and the whole frame.
const framePerfOn = /[?&]perf\b/.test(location.search) || ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
const framePerf = { simMs: 0, fxMs: 0, drawMs: 0, totalMs: 0, avgTotalMs: 0, maxTotalMs: 0, frames: 0, errors: 0, lastError: '' };
let frameErrorLogged = false;
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
const STORE = { intro: 'reanimator.introSeen.v1', hints: 'reanimator.hints.v1', reduce: 'reanimator.reduceFlash.v1', gore: 'reanimator.goreLevel.v1', volume: 'reanimator.volume.v1', difficulty: 'reanimator.difficulty.v1', assist: 'reanimator.assist.v1' } as const;
function store(key: string, value?: string): string | null {
  try {
    if (value !== undefined) localStorage.setItem(key, value);
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}


type Mode = 'title' | 'playing' | 'paused' | 'result' | 'showcase';
let mode: Mode = 'title';
let world: WorldState3D = freshWorld();
/** Difficulty and assist choices persist and apply to the next run (assist toggles also apply live). */
let difficulty: Difficulty3D = parseDifficulty(store(STORE.difficulty));
let assist: AssistOptions3D = parseAssist(store(STORE.assist));
let fireLatched = false;
const attract = new Attract();
/** Live only while EXTRAS > WATCH SHOWCASE plays. */
let showcase: Showcase | null = null;
let showcaseView: ViewMode | null = null;
/** Checkpoint being played from EXTRAS > DEMO TOUR (drives the DEMO badge and R-to-restart). */
let demoStop: DemoStop | null = null;
let deaths = 0;
let introActive = false;
/** R10 opening set piece: display-side clock, sound cue edges, and the post-handoff SHOOT prompt. The sim is held while it plays. */
const openingClock = new OpeningClock();
const openingCues = { hiss: false, lamp: false, rattle: false };
let openingAlarmAt = 0;
let openingShoot = false;
/** Showcase capture: hold the opening at a fixed time instead of letting the clock run. */
let openingFrozen = false;
const OPENING_SHOOT_HINT: Hint = { id: 'opening-shoot', keys: ['MOUSE', 'LMB'], text: 'SHOOT IT' };
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
/** Story language (EN default, KO from the browser language or the LOGS archive toggle) and the data log reader. */
let lang: Lang = pickLang(store(LANG_STORE_KEY), typeof navigator !== 'undefined' ? navigator.language : 'en');
let reader: ReaderState | null = null;
let pendingLog = '';
let creditsTimer = 0;
let bot: Bot3D | null = null;
const audioDirector = new AudioDirector();

const keys = new Set<string>();
const mouse = { ndcX: 0.28, ndcY: 0.08, normX: 0.64, normY: 0.46, leftDown: false, rightDown: false };
let lightQueued = false;
let dashQueued = false;
let interactQueued = false;
let counterQueued = false;
let scanQueued = false;
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
  const counter = counterQueued;
  counterQueued = false;
  const scan = scanQueued;
  scanQueued = false;

  let aim = currentAim3D();
  if (assist.aim) aim = assistAim(world, aim.x, aim.y);
  if (!assist.autoFire) fireLatched = false;
  const input: InputState3D = {
    moveX,
    jump: keys.has('Space') || keys.has('KeyW') || keys.has('ArrowUp'),
    dash,
    fire: stepAutoFire(fireLatched, false, mouse.leftDown).fire,
    interact,
    dropDown: keys.has('KeyS') || keys.has('ArrowDown'),
    toggleLight,
    weaponSlot,
    counter,
    scan,
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
  fireLatched = false;
  lightQueued = false;
  dashQueued = false;
  interactQueued = false;
  counterQueued = false;
  scanQueued = false;
  weaponQueue = 0;
}

function show(m: Mode): void {
  mode = m;
  ui.title.hidden = m !== 'title';
  ui.pause.hidden = m !== 'paused';
  ui.result.hidden = m !== 'result';
  ui.hud.hidden = m === 'title' || m === 'showcase';
  $('demo-badge').hidden = !(m === 'playing' && demoStop);
  if (m !== 'showcase') $('showcase-caption').hidden = true;
  ui.revived.hidden = true;
  ui.controlsPanel.hidden = true;
  closeLogReader(false);
  pendingLog = '';
  $('log-archive').hidden = true;
  closeCredits(false);
  $('lab').hidden = true;
  for (const id of Object.values(PANEL_IDS)) $(id).hidden = true;
  syncPanels();
  $('continue').hidden = !(m === 'title' && !!world.lastSaveId);
  if (m === 'title') hideTransient();
  audioDirector.syncBeds(world, m === 'playing', m === 'showcase' ? 'title' : m);
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

/** Read the real panel state, derive the top layer, and hide the title logo/menu whenever a panel is open over it. */
function syncPanels(): void {
  const tp = openTitlePanel();
  const name = (Object.keys(PANEL_IDS) as TitlePanel[]).find((k) => PANEL_IDS[k] === tp?.id) ?? null;
  const st = normalizePanelState({ mode, titlePanel: name, lab: !$('lab').hidden, revived: !ui.revived.hidden, pauseControls: !ui.controlsPanel.hidden, logArchive: !$('log-archive').hidden, logReader: !$('log-reader').hidden, creditsRoll: !$('credits-roll').hidden });
  ui.title.classList.toggle('covered', titleCovered(st));
  $('stage').dataset.topLayer = topLayer(st) ?? '';
}
{
  const mo = new MutationObserver(syncPanels);
  for (const id of [...Object.values(PANEL_IDS), 'title', 'lab', 'revived', 'pause', 'controls-panel', 'log-archive', 'log-reader', 'credits-roll', 'result']) mo.observe($(id), { attributes: true, attributeFilter: ['hidden'] });
}

function hideTransient(): void {
  for (const el of [ui.sectorCard, ui.pickupBanner, ui.coach]) {
    el.hidden = true;
    el.classList.remove('show');
  }
  coachId = '';
}

function start(forceIntro = false, stop: DemoStop | null = null): void {
  manualHold = false;
  world = freshWorld({ difficulty, assist });
  demoStop = stop;
  if (stop) applyDebugSetup(world, stop.setup);
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
  if (stop) {
    $('demo-badge-text').textContent = stop.badge;
    scene3d?.fx.observe(world, true);
    if (stop.view) applyView(stop.view, false);
    else if (viewMode !== parseViewMode(store(VIEW_STORE.mode))) applyView(parseViewMode(store(VIEW_STORE.mode)), false);
    return; // checkpoints never play the first-run intro
  }
  if (viewMode !== parseViewMode(store(VIEW_STORE.mode))) applyView(parseViewMode(store(VIEW_STORE.mode)), false);
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
  openingClock.reset();
  openingCues.hiss = openingCues.lamp = openingCues.rattle = false;
  openingAlarmAt = 0;
  openingShoot = false;
  // Failsafe if the frame loop stalls (background tab): the clock itself ends the opening in about 10 s of frames.
  introTimer = window.setTimeout(hideIntro, 30000);
  tickOpening(0);
}

/** Per-frame opening update: timeline, overlay variables, renderer view, one-shot sound and FX cues. */
function tickOpening(dt: number): void {
  if (!introActive) return;
  openingClock.advance(dt);
  const reduce = ui.reduceFlash.checked;
  const st = openingClock.state(reduce);
  const el = ui.intro;
  el.style.setProperty('--op-dark', st.dark.toFixed(3));
  el.style.setProperty('--op-frost', st.frost.toFixed(3));
  el.style.setProperty('--op-alarm', st.alarm.toFixed(3));
  el.style.setProperty('--op-sweep', `${(50 + 50 * Math.sin(st.sweep)).toFixed(1)}%`);
  el.style.setProperty('--op-flash', st.burstFlash.toFixed(3));
  const status = $('op-status');
  if (status.textContent !== st.status) status.textContent = st.status;
  if (scene3d) scene3d.opening = openingView(st);
  const t = openingClock.time;
  if (!openingCues.hiss && t >= 0.3) {
    openingCues.hiss = true;
    playSound('opening.hiss');
  }
  if (!openingCues.lamp && t >= OPENING_BEATS.lampOn) {
    openingCues.lamp = true;
    playSound('opening.lamp');
  }
  if (!openingCues.rattle && t >= OPENING_BEATS.rattle) {
    openingCues.rattle = true;
    playSound('opening.rattle');
  }
  if (st.alarm > 0.3 && t - openingAlarmAt > 0.55) {
    openingAlarmAt = t;
    playSound('world.alarm');
  }
  if (openingClock.takeBurst()) {
    playSound('opening.burst');
    scene3d?.fx.ventBurst(OPENING_VENT.x, OPENING_VENT.y);
    openingShoot = true;
  }
  if (openingClock.finished) hideIntro();
}

function hideIntro(): void {
  if (!introActive) return;
  introActive = false;
  window.clearTimeout(introTimer);
  openingFrozen = false;
  if (scene3d) scene3d.opening = null;
  ui.intro.hidden = true;
  seen.room = ''; // let the sector card appear now that the intro is gone
}

// ---- story language, data log reader, LOGS archive, credits roll (pure rules in lore.ts / logReader.ts) ----
function applyLang(): void {
  INTRO_LINES.forEach((l, i) => {
    $(`intro-l${i}`).textContent = l[lang];
  });
  $('log-lang').textContent = LORE_UI.langButton[lang];
  $('logs-open').textContent = LORE_UI.logsButton[lang];
  $('logs-close').textContent = LORE_UI.back[lang];
  $('credits-roll-open').textContent = LORE_UI.creditsButton[lang];
  document.querySelector('#log-archive h2')!.textContent = LORE_UI.archiveTitle[lang];
  $('lr-hint').textContent = LORE_UI.hintTyping[lang];
  if (!$('log-archive').hidden) renderArchive();
}

function takenLogIds(): Set<string> {
  return new Set(world.collectibles.filter((l) => l.taken).map((l) => l.id));
}

function openLogReader(id: string, from: 'pickup' | 'archive'): void {
  const e = loreLogById(id);
  if (!e) return;
  releaseInput();
  reader = openReader(e, lang, from);
  $('lr-eyebrow').textContent = `${LORE_UI.dataLog[lang]} ${e.order}/${LORE_LOGS.length}`;
  $('lr-title').textContent = e.title[lang];
  $('lr-speaker').textContent = e.speaker[lang];
  $('lr-stamp').textContent = e.stamp;
  $('lr-body').textContent = '';
  $('log-reader').hidden = false;
  playSound('ui.banner');
  renderReader();
}

function renderReader(): void {
  if (!reader) return;
  const body = $('lr-body');
  const txt = visibleBody(reader);
  if (body.textContent !== txt) body.textContent = txt;
  body.classList.toggle('typing', reader.phase === 'typing');
  const hint = reader.phase === 'typing' ? LORE_UI.hintTyping[reader.lang] : LORE_UI.hintDone[reader.lang];
  if ($('lr-hint').textContent !== hint) $('lr-hint').textContent = hint;
}

/** Hide the reader. refocus = the player closed it: hand control back to the game or to the archive row. */
function closeLogReader(refocus: boolean): void {
  const from = reader?.from;
  reader = null;
  $('log-reader').hidden = true;
  if (!refocus) return;
  releaseInput();
  playSound('ui.back');
  if (from === 'archive' && mode === 'paused') ($('log-list').querySelector<HTMLElement>(`[data-id="${seenArchiveId}"]`) ?? $('logs-close')).focus({ preventScroll: true });
  else if (mode === 'playing') {
    manualHold = false;
    canvas.focus();
  }
}
let seenArchiveId = '';

/** Any key (or click) while the reader or credits are up. */
function pressLayer(): void {
  if (!$('credits-roll').hidden) {
    closeCredits(true);
    return;
  }
  if (!reader) return;
  reader = pressReader(reader);
  if (reader.phase === 'closed') closeLogReader(true);
  else renderReader();
}

function renderArchive(): void {
  const taken = takenLogIds();
  const rows = archiveRows(taken, lang);
  $('log-count').textContent = `${rows.filter((r) => r.unlocked).length}/${rows.length} ${LORE_UI.recovered[lang]}`;
  const list = $('log-list');
  list.textContent = '';
  for (const r of rows) {
    const li = document.createElement('li');
    const row = document.createElement(r.unlocked ? 'button' : 'div');
    row.className = r.unlocked ? 'log-row' : 'log-row locked';
    if (r.unlocked) {
      (row as HTMLButtonElement).type = 'button';
      row.dataset.id = r.id;
      row.addEventListener('click', () => {
        if (!canOpen(takenLogIds(), r.id)) return;
        seenArchiveId = r.id;
        openLogReader(r.id, 'archive');
      });
    }
    for (const [cls, text] of [['lr-n', String(r.order).padStart(2, '0')], ['lr-t', r.label], ['lr-s', r.sector]] as const) {
      const span = document.createElement('span');
      span.className = cls;
      span.textContent = text;
      row.append(span);
    }
    li.append(row);
    list.append(li);
  }
}

function openArchive(): void {
  renderArchive();
  $('log-archive').hidden = false;
  ($('log-list').querySelector<HTMLElement>('button.log-row') ?? $('logs-close')).focus({ preventScroll: true });
}

function openCredits(): void {
  const box = $('credits-lines');
  box.textContent = '';
  for (const l of CREDITS_LINES) {
    const t = l[lang];
    const p = document.createElement('p');
    p.textContent = t.replace(/^#\s*/, '');
    if (t.startsWith('#')) p.className = 'h';
    box.append(p);
  }
  box.style.animation = 'none';
  void box.offsetWidth;
  box.style.animation = '';
  $('credits-roll').querySelector('.scan-hint')!.textContent = LORE_UI.hintCredits[lang];
  $('credits-roll').hidden = false;
  window.clearTimeout(creditsTimer);
  creditsTimer = window.setTimeout(() => closeCredits(true), 14500);
}

function closeCredits(refocus: boolean): void {
  window.clearTimeout(creditsTimer);
  $('credits-roll').hidden = true;
  if (refocus && mode === 'result') $('credits-roll-open').focus({ preventScroll: true });
}

function showEnding(won: boolean, pct: number): void {
  const el = $('ending');
  el.hidden = !won;
  $('credits-roll-open').hidden = !won;
  if (!won) return;
  const t = endingText(pct, lang);
  el.className = t.tier;
  $('ending-heading').textContent = t.heading;
  $('ending-p1').textContent = t.paragraphs[0];
  $('ending-p2').textContent = t.paragraphs[1];
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
  $('sc-sub').textContent = SECTOR_SUB[r.sector]?.[lang] ?? r.hint;
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

function showPickupBanner(b: { title: string; desc: string }, quiet = false): void {
  $('pb-title').textContent = b.title;
  $('pb-desc').textContent = b.desc;
  ui.pickupBanner.hidden = false;
  popClass(ui.pickupBanner, 'show', 0);
  if (!quiet) playSound('ui.banner');
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
        // The simulation plays the short grab (world.upgrade); the per-item fanfare carries the melody and ducks the music
        showPickupBanner(UPGRADE_BANNER[kind], playFanfare(kind));
        itemFreeze = ITEM_FREEZE_S;
      }
    }
    seen.collected = world.collectedUpgrades.size;
  }
  const logsNow = world.collectibles.filter((l) => l.taken);
  if (logsNow.length !== seen.logs) {
    if (logsNow.length > seen.logs) {
      const lg = logsNow[logsNow.length - 1];
      const entry = loreLogById(lg.id);
      showPickupBanner({ title: `DATA LOG ${logsNow.length}/${world.collectibles.length}`, desc: entry ? entry.title[lang] : lg.title }, playFanfare('crawl_slide') /* reuse the synth sweep fanfare: no dedicated log recipe */);
      if (entry) {
        // Short freeze first, then the reader opens (see frameBody).
        pendingLog = lg.id;
        itemFreeze = LOG_FREEZE_S;
      }
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
      if (unlocked[s - 1] === '1' && seen.unlocked[s - 1] === '0') showPickupBanner(WEAPON_BANNER[s], playFanfare('weapon'));
    }
    seen.unlocked = unlocked;
  }
  if (seen.weapon !== p.weapon) {
    seen.weapon = p.weapon;
    popClass($(`wpn-${p.weapon}`), 'switch', 0);
  }
}

function updateCoach(): void {
  if (openingShoot) {
    const crawler = world.enemies.find((e) => e.id === OPENING_ENEMY_ID);
    if (onboarding.usage.fired || !crawler || !crawler.alive || world.tick > 720 || mode !== 'playing') openingShoot = false;
  }
  const hint: Hint | null = mode === 'playing' && !manualHold && !introActive ? (openingShoot ? OPENING_SHOOT_HINT : onboarding.update(world)) : null;
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

  if (meltdownPillVisible(world)) {
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
  $('scan-pill').classList.toggle('active', p.scanTicks > 0);
  $('scan-state').textContent = p.scanTicks > 0 ? 'ACTIVE' : p.scanCooldown > 0 ? `${(p.scanCooldown / 60).toFixed(0)}s` : 'READY';
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
  const canResume = !won && canResumeNow();
  ui.resultTitle.textContent = won ? 'Escaped with the core' : 'Signal lost';
  const cp = won ? '' : canResume ? 'Press C or Enter to resume at the last Save station.' : 'No Save station reached yet. Play again restarts the run.';
  const cause = world.deathCause;
  const causeEl = $('result-cause');
  causeEl.hidden = won || !cause;
  causeEl.textContent = !won && cause ? cause.label : '';
  ui.resultDetail.textContent = `Weapon [${WEAPON_META[world.player.weapon].name}]${cp ? ' · ' + cp : ''}`;
  $('rs-time').textContent = formatClock(st.seconds);
  $('rs-kills').textContent = String(st.kills);
  $('rs-deaths').textContent = String(st.deaths);
  $('rs-collect').textContent = `${st.collectionPct}%`;
  ui.rank.hidden = !won;
  ui.rank.textContent = st.rank;
  ui.rank.className = `rank r-${st.rank}`;
  if (won) setTimeout(() => playSound('ui.rank', { pitch: rankPitch(st.rank) }), 450);
  showEnding(won, st.collectionPct);
  $('result-tip').textContent = won ? '' : cause ? cause.tip : retryTip(deaths);
  $('result-tip').hidden = won;
  ui.result.classList.toggle('won', won);
  ui.result.classList.toggle('lost', !won);
  $('resume-save').hidden = !canResume;
  show('result');
}

function frame(t: number): void {
  const t0 = performance.now();
  try {
    frameBody(t);
  } catch (err) {
    // One bad frame must not kill the loop: log the first error, count the rest, keep going.
    framePerf.errors++;
    framePerf.lastError = err instanceof Error ? err.message : String(err);
    if (!frameErrorLogged) {
      frameErrorLogged = true;
      console.error('[reanimator] frame error (loop continues):', err);
    }
  }
  if (framePerfOn) {
    const tot = performance.now() - t0;
    framePerf.totalMs = tot;
    framePerf.frames++;
    framePerf.avgTotalMs += (tot - framePerf.avgTotalMs) * 0.05;
    if (tot > framePerf.maxTotalMs) framePerf.maxTotalMs = tot;
    if (scene3d) {
      framePerf.fxMs = scene3d.frameMs.fx;
      framePerf.drawMs = scene3d.frameMs.draw;
    }
  }
  requestAnimationFrame(frame);
}

function frameBody(t: number): void {
  const dt = Math.min(0.1, (t - last) / 1000 || 1 / 60);
  last = t;
  const fx = scene3d?.fx;
  let frozen = false;
  if (reader) {
    reader = tickReader(reader, dt);
    renderReader();
  }
  if (introActive) tickOpening(openingFrozen ? 0 : dt);
  if (mode === 'playing' && !manualHold && !reader && !introActive) {
    // Hit-stop and kill slow-motion only retime the display clock. Every simulation tick still runs, in order.
    frozen = fx ? fx.hitstop.step() : false;
    if (itemFreeze > 0) {
      itemFreeze = Math.max(0, itemFreeze - dt);
      frozen = true;
      if (itemFreeze === 0 && pendingLog) {
        openLogReader(pendingLog, 'pickup');
        pendingLog = '';
      }
    }
    const clock = fx ? fx.slowmo.step(dt) : 1;
    if (!frozen) acc += dt * clock * displayClock(assist.slow);
    const stepDt = 1 / SIM_HZ_3D;
    let steps = 0;
    const simT0 = performance.now();
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
    framePerf.simMs = performance.now() - simT0;
    if (!frozen) flash = Math.max(0, flash - dt * 3.2);
  }
  if (scene3d) {
    scene3d.reduceMotion = ui.reduceFlash.checked;
    scene3d.fx.gore.level = goreLevel;
    scene3d.fxTimeScale = frozen ? 0 : fx ? fx.slowmo.scale : 1;
  }
  if (mode === 'title' || mode === 'showcase') {
    // Attract mode: a bot plays a private world behind the title. Never touches `world` or human input.
    // The captioned showcase uses the same path with its own reel.
    const reel = mode === 'showcase' && showcase ? showcase : attract;
    if (reel.advance(dt)) {
      scene3d?.fx.reset();
      if (reel === showcase) onShowcaseCut();
    }
    scene3d?.setAttractCamera(reel.time, reel.shot);
    canvas.style.opacity = String(1 - reel.fade * 0.96);
    if (scene3d) scene3d.render(reel.world, reel.alpha);
    else renderFallback2D3D(canvas, reel.world);
    viewFx.afterRender(performance.now());
    if (reel === showcase) {
      $('showcase-caption').style.opacity = String(showcase.captionAlpha);
      if (showcase.done) exitShowcase();
    }
  } else {
    scene3d?.setAttractCamera(null);
    if (canvas.style.opacity) canvas.style.opacity = '';
    renderWorld(mode === 'playing' && !manualHold ? Math.min(1, acc * SIM_HZ_3D) : 1);
    hud();
    observeWorld();
    updateCoach();
  }
}

// ---- EXTRAS > WATCH SHOWCASE: one-minute captioned autoplay, any key exits ----
function onShowcaseCut(): void {
  if (!showcase) return;
  const c = showcase.cut;
  $('showcase-title').textContent = c.caption;
  $('showcase-sub').textContent = c.sub;
  if (c.view && c.view !== viewMode) applyView(c.view, false);
}

function startShowcase(): void {
  showcase = new Showcase();
  showcaseView = viewMode;
  demoStop = null;
  releaseInput();
  scene3d?.fx.reset();
  show('showcase');
  $('showcase-caption').hidden = false;
  $('showcase-caption').style.opacity = '0';
  if (viewMode !== 'modern') applyView('modern', false);
  onShowcaseCut();
}

function exitShowcase(): void {
  if (mode !== 'showcase') return;
  showcase = null;
  if (showcaseView && showcaseView !== viewMode) applyView(showcaseView, false);
  showcaseView = null;
  scene3d?.fx.reset();
  show('title');
  openPanelFor('extras', 'showcase-open');
}

/** Restart whatever is being played: the demo checkpoint if there is one, else a normal run. */
function restartCurrent(): void {
  start(false, demoStop);
}

/** Story respawns near where you fell, so a defeat is always resumable. Other difficulties need a Save station. */
function canResumeNow(): boolean {
  return !!world.lastSaveId || world.diff.nearRespawn;
}

function resumeAtSave(): boolean {
  if (mode !== 'result' || world.status !== 'lost' || !canResumeNow()) return false;
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
  for (const el of [$('log-reader'), $('credits-roll'), $('log-archive'), $('lab'), ui.revived, ui.controlsPanel]) if (!el.hidden) return el;
  if (mode === 'title') return openTitlePanel() ?? ui.title;
  return mode === 'paused' ? ui.pause : ui.result;
}

function closeSubPanels(): boolean {
  const tp = openTitlePanel();
  if (!$('lab').hidden) $('lab').hidden = true;
  else if (!ui.revived.hidden) ui.revived.hidden = true;
  else if (!ui.controlsPanel.hidden) ui.controlsPanel.hidden = true;
  else if (!$('log-archive').hidden) {
    $('log-archive').hidden = true;
    $('logs-open').focus({ preventScroll: true });
    return true;
  } else if (tp) {
    // Controls opens from Extras, so it goes back there; everything else returns to the main menu.
    if (tp.id === PANEL_IDS.controls) return openPanelFor('extras', 'title-controls-open'), true;
    if (tp.id === PANEL_IDS.credits) return openPanelFor('extras', 'credits-open'), true;
    if (tp.id === PANEL_IDS.demo) return openPanelFor('extras', 'demo-open'), true;
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
  if (mode === 'showcase') {
    if (!e.repeat && !e.metaKey && !e.ctrlKey && !e.altKey && !/^F\d+$/.test(e.code)) exitShowcase();
    e.preventDefault();
    return;
  }
  if (reader || !$('credits-roll').hidden) {
    // Reader and credits own the keyboard: any key advances or closes them (modifier-only presses are ignored).
    e.preventDefault();
    if (!e.repeat && !/^(Shift|Control|Alt|Meta)(Left|Right)$/.test(e.code)) pressLayer();
    return;
  }
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
  if (mode === 'paused' && e.code === 'Escape' && (!ui.controlsPanel.hidden || !$('log-archive').hidden)) {
    closeSubPanels();
    e.preventDefault();
    return;
  }
  if (mode !== 'playing' && menuNavigate(e)) return;
  if (mode === 'result' && e.code === 'KeyR') {
    restartCurrent();
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
  if ((e.code === 'KeyX' || e.code === 'KeyC') && !e.repeat) counterQueued = true;
  if (e.code === 'KeyZ' && !e.repeat) scanQueued = true;
  if (e.code === 'Digit1' && !e.repeat) weaponQueue = 1;
  if (e.code === 'Digit2' && !e.repeat) weaponQueue = 2;
  if (e.code === 'Digit3' && !e.repeat) weaponQueue = 3;
  if (e.code === 'Digit4' && !e.repeat) weaponQueue = 4;
  if (e.code === 'Digit5' && !e.repeat) weaponQueue = 5;
  if (e.code === 'Digit6' && !e.repeat) weaponQueue = 6;
  if (e.code === 'KeyQ' && !e.repeat) cycleWeapon(1);
  if (e.code === 'KeyR' && !e.repeat) restartCurrent();
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
  if (e.button === 0) {
    mouse.leftDown = true;
    if (assist.autoFire) fireLatched = stepAutoFire(fireLatched, true, false).latched;
  }
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
window.addEventListener('pointerdown', () => {
  hideIntro();
  exitShowcase();
});
$('intro-open').addEventListener('click', () => start(true));
$('settings-open').addEventListener('click', () => openPanelFor('settings', 'reduce-flash'));
$('settings-close').addEventListener('click', () => closeTitlePanel('settings-open'));
$('extras-open').addEventListener('click', () => openPanelFor('extras', 'demo-open'));
$('extras-close').addEventListener('click', () => closeTitlePanel('extras-open'));
$('title-controls-open').addEventListener('click', () => openPanelFor('controls', 'title-controls-close'));
$('title-controls-close').addEventListener('click', () => openPanelFor('extras', 'title-controls-open'));
$('demo-open').addEventListener('click', () => openPanelFor('demo', `demo-${DEMO_STOPS[0].id}`));
$('demo-close').addEventListener('click', () => openPanelFor('extras', 'demo-open'));
$('showcase-open').addEventListener('click', startShowcase);
// Demo tour list: one button per checkpoint, each enters the normal play loop with that checkpoint's setup.
for (const stop of DEMO_STOPS) {
  const b = document.createElement('button');
  b.id = `demo-${stop.id}`;
  b.className = 'mi';
  b.setAttribute('role', 'menuitem');
  b.innerHTML = '<span class="mi-mark" aria-hidden="true"></span>';
  b.append(stop.label);
  b.addEventListener('click', () => start(false, stop));
  b.addEventListener('mouseenter', () => b.focus({ preventScroll: true }));
  $('demo-list').append(b);
}
$('credits-open').addEventListener('click', () => openPanelFor('credits', 'credits-close'));
$('credits-close').addEventListener('click', () => openPanelFor('extras', 'credits-open'));
$('continue').addEventListener('click', () => {
  if (!world.lastSaveId) return;
  demoStop = null;
  $('demo-badge').hidden = true;
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
$('logs-open').addEventListener('click', openArchive);
$('logs-close').addEventListener('click', () => {
  $('log-archive').hidden = true;
  $('logs-open').focus();
});
$('log-lang').addEventListener('click', () => {
  lang = otherLang(lang);
  store(LANG_STORE_KEY, lang);
  applyLang();
  $('log-lang').focus({ preventScroll: true });
});
$('credits-roll-open').addEventListener('click', openCredits);
$('log-reader').addEventListener('click', pressLayer);
$('credits-roll').addEventListener('click', pressLayer);
applyLang();
$('view-toggle').addEventListener('click', toggleView);
$('crt-toggle').addEventListener('click', () => applyCrt(!crtOn));
applyView(parseViewMode(store(VIEW_STORE.mode)), false);
applyCrt(parseCrt(store(VIEW_STORE.crt)), false);
for (const el of [ui.reduceFlash, ui.reduceFlashP]) el.addEventListener('change', () => applyReduceFx(el.checked));
for (const el of [ui.goreLevel, ui.goreLevelP]) el.addEventListener('change', () => applyGore(parseGoreLevel(el.value)));
applyGore(goreLevel);
// Difficulty and assist: persisted, mirrored between the title and pause panels. Difficulty is read when a run starts.
const ASSIST_IDS: Record<keyof AssistOptions3D, string> = { aim: 'assist-aim', autoFire: 'assist-autofire', slow: 'assist-slow', hazardWarn: 'assist-hazard' };
function applyDifficulty(d: Difficulty3D): void {
  difficulty = d;
  $<HTMLSelectElement>('difficulty').value = d;
  $('difficulty-note').textContent = difficultyNote(d);
  store(STORE.difficulty, d);
}
function applyAssist(next: Partial<AssistOptions3D>): void {
  assist = { ...assist, ...next };
  setAssist3D(world, assist);
  for (const [k, id] of Object.entries(ASSIST_IDS) as [keyof AssistOptions3D, string][]) {
    $<HTMLInputElement>(id).checked = assist[k];
    $<HTMLInputElement>(`${id}-p`).checked = assist[k];
  }
  store(STORE.assist, JSON.stringify(assist));
}
$<HTMLSelectElement>('difficulty').addEventListener('change', (e) => applyDifficulty(parseDifficulty((e.target as HTMLSelectElement).value)));
for (const [k, id] of Object.entries(ASSIST_IDS) as [keyof AssistOptions3D, string][]) {
  for (const el of [$<HTMLInputElement>(id), $<HTMLInputElement>(`${id}-p`)]) el.addEventListener('change', () => applyAssist({ [k]: el.checked }));
}
applyDifficulty(difficulty);
applyAssist(assist);
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
$('restart').addEventListener('click', () => restartCurrent());
$('resume-save').addEventListener('click', () => { resumeAtSave(); });
$('restart-p').addEventListener('click', () => restartCurrent());
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

// ---- Restoration Lab (Preserved 15 Hz DOS Engine Proof): view in src/ui/labView.ts, pure model in labModel.ts ----
const labCtl = initLab();
$('lab-open').addEventListener('click', () => labCtl.open());

function buildSnapshot() {
  const warden = world.enemies.find((e) => e.kind === 'warden');
  const tel = scene3d
    ? scene3d.getTelemetry()
    : { modelsLoaded: false, loadedModels: [], failedModels: [], riggedCount: 0, activeAnimations: {}, fx: null, player: null, enemyRender: {} as Record<string, { yaw: number; clip: string; timeScale: number; x: number; y: number; z: number }> };
  const b = world.player.body;
  return {
    lab: ((l) => (l ? { id: l.scenario.id, status: l.status, mutation: l.mutation } : null))(labCtl.current()),
    mode,
    difficulty: world.difficulty,
    assist: { ...world.assist },
    deathCause: world.deathCause ? world.deathCause.key : null,
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
    frame: framePerfOn ? { ...framePerf } : null,
    ...tel,
  };
}

export type { DebugSetup3D };

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
  __reanimatorShowcase: (name: string) => Promise<ReturnType<typeof buildSnapshot>>;
  __reanimatorDemo: (id: string) => ReturnType<typeof buildSnapshot>;
  __reanimatorSoak: (n?: number, opts?: SoakOptions) => Promise<SoakReport>;
  __reanimatorUiAudit: () => Promise<UiAuditReport>;
  __reanimatorShowLog: (id: string, view?: 'reader' | 'archive' | 'credits' | 'ending') => ReturnType<typeof buildSnapshot>;
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

/**
 * Debug only: `__reanimatorShowLog('log_core')` opens the scan reader for any log id (taken or not) over the frozen game with the
 * text fully typed. view 'archive' opens the pause LOGS list (ids ignored), 'credits' rolls the credits, 'ending' shows a won result.
 */
wAny.__reanimatorShowLog = (id, view = 'reader') => {
  if (view === 'archive') {
    enterManual();
    show('paused');
    openArchive();
  } else if (view === 'credits' || view === 'ending') {
    wAny.__reanimatorShowResult('won');
    if (view === 'credits') openCredits();
  } else {
    enterManual();
    hud();
    openLogReader(id, 'pickup');
    if (reader) {
      reader = { ...reader, phase: 'done', shown: reader.total, elapsed: 5 };
      renderReader();
    }
  }
  return buildSnapshot();
};

/** Debug only: list meshes under a CSS-pixel viewport point, nearest first. */
wAny.__reanimatorPick = (px, py, includePoints = false) => scene3d?.pickAt(px, py, includePoints) ?? [];

function settleFrames(n: number): Promise<void> {
  return new Promise((res) => {
    let i = 0;
    const tick = (): void => {
      if (++i >= n) res();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

/**
 * Showcase scenes for README captures: `await __reanimatorShowcase(name)`. Names: title, classic, combat, boss, mines, opening, opening-wake, opening-alarm,
 * biolabs, security, slide, escape, lab. Each call builds the scene from a fresh deterministic world, renders it, and
 * resolves with the snapshot once the renderer has had a few real frames to settle (particles, bloom, camera).
 */
wAny.__reanimatorShowcase = async (name) => {
  const sc = SHOWCASE_SCENES[name];
  if (!sc) throw new Error(`unknown showcase scene "${name}"; known: ${SHOWCASE_NAMES.join(', ')}`);
  // Models stream in after first paint; give them a bounded wait so captures never show placeholder meshes.
  for (let i = 0; i < 100 && scene3d && !scene3d.getTelemetry().modelsLoaded; i++) await settleFrames(3);
  exitShowcase();
  demoStop = null;
  hideIntro();
  scene3d?.fx.reset();
  if (sc.kind === 'world') {
    applyView(sc.view ?? 'modern', false);
    world = freshWorld();
    bot = null;
    applyDebugSetup(world, sc.setup ?? {});
    enterManual();
    if (sc.openingAt !== undefined) {
      showIntro();
      openingFrozen = true;
      openingClock.time = sc.openingAt;
      openingCues.hiss = openingCues.lamp = openingCues.rattle = true;
      if (sc.openingAt >= OPENING_BEATS.burst) {
        openingClock.takeBurst();
        openingShoot = false;
        scene3d?.fx.ventBurst(OPENING_VENT.x, OPENING_VENT.y);
      }
      tickOpening(0);
    }
    for (const inp of sc.inputs ?? []) {
      world = stepWorld3D(world, { ...emptyInput3D(), aimX: world.player.body.x + world.player.facing * 8, aimY: world.player.body.y + 1.12, ...inp });
      scene3d?.fx.observe(world);
      if (world.status !== 'playing') break;
    }
    renderWorld();
    hud();
  } else {
    applyView('modern', false);
    show('title');
    if (sc.kind === 'title') {
      // Mid-cut of the Acid Mines shot, wide framing, no fade.
      attract.reset();
      attract.advance(REEL_SEGMENT_SECONDS + 2);
    } else {
      $('lab-open').click();
    }
  }
  await settleFrames(sc.settleFrames);
  return buildSnapshot();
};

/** Enter a DEMO TOUR checkpoint by id without touching the menu (same path as the menu button). */
wAny.__reanimatorDemo = (id) => {
  const stop = DEMO_STOPS.find((d) => d.id === id);
  if (!stop) throw new Error(`unknown demo stop "${id}"; known: ${DEMO_STOPS.map((d) => d.id).join(', ')}`);
  exitShowcase();
  start(false, stop);
  return buildSnapshot();
};

interface SoakOptions {
  /** Skip the 10 showcase scenes (they wait on real frames and make the run slow). */
  showcase?: boolean;
  /** Simulation ticks advanced after every state change. Default 60. */
  stepTicks?: number;
  /** Record renderer.info.memory deltas (geometries, textures) per stage so the stage that grows can be named. */
  trace?: boolean;
}
/** One stage of a soak iteration and how much it changed renderer.info.memory. Only the non-zero stages matter. */
interface SoakTraceRow {
  iter: number;
  stage: string;
  geometries: number;
  textures: number;
  dGeometries: number;
  dTextures: number;
}
interface SoakSample {
  iter: number;
  geometries: number;
  textures: number;
  programs: number;
  drawCalls: number;
  sceneChildren: number;
  sceneObjects: number;
  particles: number;
  smoke: number;
  goreChunks: number;
  goreDecals: number;
  popups: number;
  audioTracked: number;
  audioActive: number;
  audioLoops: number;
  jsHeapMB: number | null;
  frameErrors: number;
}
interface SoakReport {
  iterations: number;
  samples: SoakSample[];
  /** Metrics that kept rising after the warm-up iteration (a leak candidate). Empty means stable. */
  leaks: Array<{ metric: string; baseline: number; last: number }>;
  /** Present with {trace:true}: every stage of every iteration with its geometry/texture delta. */
  trace?: SoakTraceRow[];
  /** Present with {trace:true}: per stage, the sum of deltas over iterations 1..n-1 (iteration 0 is warm-up). Non-zero = leak. */
  traceSteady?: Array<{ stage: string; dGeometries: number; dTextures: number }>;
  /** Bounded pools: reported for inspection, never flagged. */
  pooled: string[];
  ok: boolean;
  steps: number;
  ms: number;
}

/** Metrics that must be flat once the first iteration has compiled shaders and loaded models. */
const SOAK_STABLE: ReadonlyArray<keyof SoakSample> = ['geometries', 'textures', 'programs', 'sceneChildren', 'sceneObjects', 'audioTracked', 'audioLoops', 'frameErrors'];
const SOAK_POOLED: ReadonlyArray<keyof SoakSample> = ['drawCalls', 'particles', 'smoke', 'goreChunks', 'goreDecals', 'popups', 'audioActive', 'jsHeapMB'];

function soakSample(iter: number): SoakSample {
  const snap = buildSnapshot();
  const perf = (snap as { perf?: { geometries: number; textures: number; programs: number; drawCalls: number; sceneChildren: number; sceneObjects: number } }).perf;
  const fx = (snap as { fx?: { activeParticles: number; smoke: number; goreChunks: number; goreDecals: number; popups: number } | null }).fx;
  const a = getAudioDebug();
  const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
  return {
    iter,
    geometries: perf?.geometries ?? 0,
    textures: perf?.textures ?? 0,
    programs: perf?.programs ?? 0,
    drawCalls: perf?.drawCalls ?? 0,
    sceneChildren: perf?.sceneChildren ?? 0,
    sceneObjects: perf?.sceneObjects ?? 0,
    particles: fx?.activeParticles ?? 0,
    smoke: fx?.smoke ?? 0,
    goreChunks: fx?.goreChunks ?? 0,
    goreDecals: fx?.goreDecals ?? 0,
    popups: fx?.popups ?? 0,
    audioTracked: a.trackedVoices,
    audioActive: a.activeVoices,
    audioLoops: a.loops.length,
    jsHeapMB: mem ? Math.round((mem.usedJSHeapSize / 1048576) * 10) / 10 : null,
    frameErrors: framePerf.errors,
  };
}

/**
 * Leak harness. Each iteration visits all DEMO checkpoints, all showcase scenes, a Classic toggle and a restart,
 * advancing `stepTicks` simulation ticks after each, then samples renderer, fx and audio counters in an identical end
 * state (modern view, fresh run, +stepTicks). Iteration 0 is warm-up (shader compile, model load); a stable metric
 * that is higher at the end than at iteration 1 is reported in `leaks`.
 */
wAny.__reanimatorSoak = async (n = 3, opts = {}) => {
  const t0 = performance.now();
  const stepTicks = opts.stepTicks ?? 60;
  const withShowcase = opts.showcase !== false;
  const idle = Array.from({ length: stepTicks }, () => ({}) as Partial<InputState3D>);
  let steps = 0;
  const step = (): void => {
    wAny.__reanimatorStep(idle);
    steps++;
  };
  const samples: SoakSample[] = [];
  const trace: SoakTraceRow[] = [];
  const mem = (): { g: number; t: number } => {
    const m = (buildSnapshot() as { perf?: { geometries: number; textures: number } }).perf;
    return { g: m?.geometries ?? 0, t: m?.textures ?? 0 };
  };
  let prev = opts.trace ? mem() : { g: 0, t: 0 };
  let iterNow = 0;
  const mark = (stage: string): void => {
    if (!opts.trace) return;
    const cur = mem();
    trace.push({ iter: iterNow, stage, geometries: cur.g, textures: cur.t, dGeometries: cur.g - prev.g, dTextures: cur.t - prev.t });
    prev = cur;
  };
  for (let iter = 0; iter < n; iter++) {
    iterNow = iter;
    // A debug world builds its own Level3D object: forces the renderer to tear down and rebuild the static level.
    wAny.__reanimatorAdvance(idle);
    steps++;
    mark('advance');
    for (const stop of DEMO_STOPS) {
      wAny.__reanimatorDemo(stop.id);
      step();
      mark(`demo:${stop.id}`);
    }
    if (withShowcase) {
      for (const name of SHOWCASE_NAMES) {
        await wAny.__reanimatorShowcase(name);
        if (SHOWCASE_SCENES[name].kind === 'world') step();
        mark(`showcase:${name}`);
      }
    }
    applyView('classic', false);
    step();
    mark('classic-on');
    applyView('modern', false);
    step();
    mark('classic-off');
    exitShowcase();
    start(false);
    enterManual();
    step();
    await settleFrames(2);
    mark('restart');
    samples.push(soakSample(iter));
  }
  const base = samples[Math.min(1, samples.length - 1)];
  const last = samples[samples.length - 1];
  const leaks: SoakReport['leaks'] = [];
  if (samples.length > 1) {
    for (const k of SOAK_STABLE) {
      const b = base[k] as number;
      const l = last[k] as number;
      if (l > b) leaks.push({ metric: k, baseline: b, last: l });
    }
  }
  let traceSteady: SoakReport['traceSteady'];
  if (opts.trace) {
    const acc = new Map<string, { dGeometries: number; dTextures: number }>();
    for (const r of trace) {
      if (r.iter === 0) continue;
      const a = acc.get(r.stage) ?? { dGeometries: 0, dTextures: 0 };
      a.dGeometries += r.dGeometries;
      a.dTextures += r.dTextures;
      acc.set(r.stage, a);
    }
    traceSteady = [...acc].map(([stage, v]) => ({ stage, ...v })).filter((r) => r.dGeometries !== 0 || r.dTextures !== 0);
  }
  return { iterations: n, samples, leaks, ...(opts.trace ? { trace, traceSteady } : {}), pooled: SOAK_POOLED.map(String), ok: leaks.length === 0, steps, ms: Math.round(performance.now() - t0) };
};

/**
 * Debug only: `await __reanimatorUiAudit()`. Opens every panel through its real buttons (title, settings, extras, demo,
 * controls, revived, lab, credits, pause, pause controls, logs, result) and checks, per control, that elementFromPoint at its
 * center is the control itself, that it is opaque, and that the title logo and menu are hidden under any open panel.
 * Resets to a fresh title screen afterwards (the current run is discarded). Returns { ok, scenarios[] }.
 */
wAny.__reanimatorUiAudit = () =>
  runUiAudit({
    toTitle: () => {
      exitShowcase();
      hideIntro();
      show('title');
    },
    toPaused: () => show('paused'),
    toResult: () => {
      wAny.__reanimatorShowResult('lost');
    },
    frames: settleFrames,
  }).then((r) => {
    world = freshWorld();
    show('title');
    return r;
  });

show('title');
requestAnimationFrame(frame);

