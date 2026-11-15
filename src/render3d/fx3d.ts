// Game-feel layer, pure logic (no WebGL): trauma camera shake, hit-stop and slow-motion timers, camera rig with
// look-ahead and dead zone, a pooled particle simulation, and a director that derives effects from world-state
// diffs. Everything here is display-side. It reads the simulation and never writes to it, so determinism of
// stepWorld3D is untouched. GPU upload lives in fx3dGfx.ts.

import { RAIL_CHARGE_TICKS } from '../game3d/world3d.ts';
import { chooseMuzzle } from './heroPose.ts';
import type { EnemyKind3D, EnemyState3D, WorldState3D } from '../game3d/world3d.ts';
import { PopupPool } from './popups3d.ts';
import { orbitAngle, popupTier, projectileStyle, stepChroma } from './vfxStyle3d.ts';
import { GoreSim, goreScale, type GoreKind } from './gore3d.ts';

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

// ---------------------------------------------------------------------------------------------------------------
// Trauma shake (Squirrel Eiserloh): offset ~ trauma^2 * smooth noise. Linear decay.
// ---------------------------------------------------------------------------------------------------------------
export const TRAUMA_DECAY_PER_SEC = 1.7;
export const SHAKE_MAX_POS = 0.55;
export const SHAKE_MAX_ROLL = 0.035;
/** Multiplier applied to trauma while "Reduce flashing" is on. */
export const REDUCE_MOTION_SCALE = 0.3;

export class Trauma {
  value = 0;
  readonly out = { x: 0, y: 0, roll: 0 };

  add(amount: number): void {
    this.value = clamp(this.value + amount, 0, 1);
  }

  decay(dt: number): void {
    this.value = Math.max(0, this.value - TRAUMA_DECAY_PER_SEC * dt);
  }

  /** Fills and returns `out`; no allocation. */
  sample(tSec: number, reduce = false): { x: number; y: number; roll: number } {
    const k = reduce ? REDUCE_MOTION_SCALE : 1;
    const s = this.value * this.value * k;
    this.out.x = s * SHAKE_MAX_POS * smoothNoise(tSec * 23.0, 0.3);
    this.out.y = s * SHAKE_MAX_POS * smoothNoise(tSec * 27.0, 7.1);
    this.out.roll = s * SHAKE_MAX_ROLL * smoothNoise(tSec * 19.0, 13.7);
    return this.out;
  }
}

/** Cheap band-limited noise in about [-1, 1]. Deterministic. */
export function smoothNoise(t: number, seed: number): number {
  return (Math.sin(t + seed * 11.3) * 0.55 + Math.sin(t * 2.31 + seed * 5.7) * 0.3 + Math.sin(t * 4.77 + seed * 2.9) * 0.15);
}

// ---------------------------------------------------------------------------------------------------------------
// Hit-stop: display frames to freeze before the next simulation step. Never skips a tick, only delays the clock.
// ---------------------------------------------------------------------------------------------------------------
export const HITSTOP_MAX_FRAMES = 6;
export const HITSTOP_REFRACTORY_FRAMES = 5;

export class HitStop {
  frames = 0;
  refractory = 0;
  /** Total display frames frozen so far (telemetry). */
  totalFrozen = 0;

  /** `force` bypasses the refractory window (kills, player damage). Returns true if accepted. */
  request(frames: number, force = false): boolean {
    const n = clamp(Math.round(frames), 0, HITSTOP_MAX_FRAMES);
    if (n <= 0) return false;
    if (this.frames > 0) {
      this.frames = Math.max(this.frames, n);
      return true;
    }
    if (this.refractory > 0 && !force) return false;
    this.frames = n;
    return true;
  }

  /** Call once per display frame in the human loop. True means: do not advance the simulation clock this frame. */
  step(): boolean {
    if (this.frames > 0) {
      this.frames--;
      this.totalFrozen++;
      if (this.frames === 0) this.refractory = HITSTOP_REFRACTORY_FRAMES;
      return true;
    }
    if (this.refractory > 0) this.refractory--;
    return false;
  }

  reset(): void {
    this.frames = 0;
    this.refractory = 0;
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Slow motion (display clock scale). 1 = normal. Eases back to 1 once the hold time elapses.
// ---------------------------------------------------------------------------------------------------------------
export class SlowMo {
  scale = 1;
  private target = 1;
  private hold = 0;

  request(scale: number, seconds: number): void {
    if (scale < this.target || this.hold <= 0) this.target = scale;
    this.hold = Math.max(this.hold, seconds);
  }

  /** Real-time dt in, returns the clock scale for this frame. */
  step(dt: number): number {
    if (this.hold > 0) {
      this.hold -= dt;
      this.scale += (this.target - this.scale) * (1 - Math.exp(-dt * 30));
    } else {
      this.target = 1;
      this.scale += (1 - this.scale) * (1 - Math.exp(-dt * 7));
      if (this.scale > 0.995) this.scale = 1;
    }
    return this.scale;
  }

  reset(): void {
    this.scale = 1;
    this.target = 1;
    this.hold = 0;
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Camera rig: smoothed look-ahead (aim + velocity), soft dead zone, FOV punch.
// ---------------------------------------------------------------------------------------------------------------
export const CAM_DEADZONE_X = 0.7;
export const CAM_DEADZONE_Y = 0.45;
const CAM_AIR_DEADZONE_Y = 1.7;
export const CAM_LOOK_MAX_X = 3.0;
export const CAM_LOOK_MAX_Y = 1.3;

export class CameraRig {
  fx = 0;
  fy = 0;
  lookX = 0;
  lookY = 0;
  fovKick = 0;
  private ready = false;

  /** tx,ty: anchor (player focus point). aimDX/DY: aim point minus player. vx: player velocity (m/s). */
  update(dt: number, tx: number, ty: number, vx: number, aimDX: number, aimDY: number, grounded: boolean): void {
    const wantLx = clamp(aimDX * 0.14, -2.2, 2.2) + clamp(vx * 0.12, -1.3, 1.3);
    const wantLy = clamp(aimDY * 0.1, -CAM_LOOK_MAX_Y, CAM_LOOK_MAX_Y);
    const lk = 1 - Math.exp(-dt * 3.0);
    this.lookX += (clamp(wantLx, -CAM_LOOK_MAX_X, CAM_LOOK_MAX_X) - this.lookX) * lk;
    this.lookY += (wantLy - this.lookY) * lk;

    const gx = tx + this.lookX;
    const gy = ty + this.lookY;
    if (!this.ready || Math.hypot(gx - this.fx, gy - this.fy) > 9) {
      this.fx = gx;
      this.fy = gy;
      this.ready = true;
    } else {
      // Dead zone: only the part of the error beyond the box drives the follow, so there is no jitter inside it.
      const ex = gx - this.fx;
      const ey = gy - this.fy;
      const dx = Math.sign(ex) * Math.max(0, Math.abs(ex) - CAM_DEADZONE_X);
      // Airborne: wide vertical dead zone (platformer convention); landing shrinks it and re-aligns.
      const dy = Math.sign(ey) * Math.max(0, Math.abs(ey) - (grounded ? CAM_DEADZONE_Y : CAM_AIR_DEADZONE_Y));
      this.fx += dx * (1 - Math.exp(-dt * 8));
      this.fy += dy * (1 - Math.exp(-dt * (grounded ? 6.5 : 4.5)));
    }
    this.fovKick *= Math.exp(-dt * 6.5);
  }

  punch(deg: number): void {
    this.fovKick = clamp(this.fovKick + deg, -4, 5);
  }

  reset(): void {
    this.ready = false;
    this.lookX = 0;
    this.lookY = 0;
    this.fovKick = 0;
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Particle pool. Structure of arrays, fixed capacity, swap-remove, zero allocation per emit/update.
// ---------------------------------------------------------------------------------------------------------------
export class ParticlePool {
  readonly capacity: number;
  count = 0;
  /** Total emitted since creation (telemetry). */
  emitted = 0;
  private cursor = 0;
  readonly px: Float32Array;
  readonly py: Float32Array;
  readonly pz: Float32Array;
  readonly vx: Float32Array;
  readonly vy: Float32Array;
  readonly vz: Float32Array;
  readonly age: Float32Array;
  readonly life: Float32Array;
  readonly s0: Float32Array;
  readonly s1: Float32Array;
  readonly cr: Float32Array;
  readonly cg: Float32Array;
  readonly cb: Float32Array;
  readonly ca: Float32Array;
  readonly grav: Float32Array;
  readonly drag: Float32Array;
  readonly rot: Float32Array;
  readonly spin: Float32Array;
  readonly stretch: Float32Array;
  // GPU-facing instance data (filled by write()).
  readonly aPos: Float32Array;
  readonly aCol: Float32Array;
  readonly aMisc: Float32Array;

  constructor(capacity: number) {
    this.capacity = capacity;
    const f = (): Float32Array => new Float32Array(capacity);
    this.px = f(); this.py = f(); this.pz = f();
    this.vx = f(); this.vy = f(); this.vz = f();
    this.age = f(); this.life = f();
    this.s0 = f(); this.s1 = f();
    this.cr = f(); this.cg = f(); this.cb = f(); this.ca = f();
    this.grav = f(); this.drag = f(); this.rot = f(); this.spin = f(); this.stretch = f();
    this.aPos = new Float32Array(capacity * 4);
    this.aCol = new Float32Array(capacity * 4);
    this.aMisc = new Float32Array(capacity * 2);
  }

  /**
   * Emit one particle. `stretch` > 1 elongates along x; with spin 0 the quad aligns to velocity.
   * Pool full: overwrites a round-robin victim so the newest effect always shows.
   */
  emit(
    x: number, y: number, z: number, vx: number, vy: number, vz: number,
    life: number, s0: number, s1: number,
    r: number, g: number, b: number, a: number,
    grav = 0, drag = 0, stretch = 1, rot = 0, spin = 0,
  ): void {
    let i: number;
    if (this.count < this.capacity) {
      i = this.count++;
    } else {
      i = this.cursor;
      this.cursor = (this.cursor + 1) % this.capacity;
    }
    this.px[i] = x; this.py[i] = y; this.pz[i] = z;
    this.vx[i] = vx; this.vy[i] = vy; this.vz[i] = vz;
    this.age[i] = 0; this.life[i] = Math.max(0.016, life);
    this.s0[i] = s0; this.s1[i] = s1;
    this.cr[i] = r; this.cg[i] = g; this.cb[i] = b; this.ca[i] = a;
    this.grav[i] = grav; this.drag[i] = drag;
    this.stretch[i] = stretch; this.rot[i] = rot; this.spin[i] = spin;
    this.emitted++;
  }

  update(dt: number): void {
    let i = this.count - 1;
    for (; i >= 0; i--) {
      const a = (this.age[i] += dt);
      if (a >= this.life[i]) {
        this.removeAt(i);
        continue;
      }
      const d = Math.max(0, 1 - this.drag[i] * dt);
      this.vy[i] -= this.grav[i] * dt;
      this.vx[i] *= d;
      this.vy[i] *= d;
      this.vz[i] *= d;
      this.px[i] += this.vx[i] * dt;
      this.py[i] += this.vy[i] * dt;
      this.pz[i] += this.vz[i] * dt;
      this.rot[i] += this.spin[i] * dt;
    }
  }

  private removeAt(i: number): void {
    const l = --this.count;
    if (i === l) return;
    const arrs = [
      this.px, this.py, this.pz, this.vx, this.vy, this.vz, this.age, this.life, this.s0, this.s1,
      this.cr, this.cg, this.cb, this.ca, this.grav, this.drag, this.rot, this.spin, this.stretch,
    ];
    for (let k = 0; k < arrs.length; k++) arrs[k][i] = arrs[k][l];
  }

  /** Pack live particles into aPos/aCol/aMisc. Returns the instance count. */
  write(): number {
    const n = this.count;
    for (let i = 0; i < n; i++) {
      const t = this.age[i] / this.life[i];
      const size = this.s0[i] + (this.s1[i] - this.s0[i]) * t;
      const fade = 1 - t;
      const o4 = i * 4;
      this.aPos[o4] = this.px[i];
      this.aPos[o4 + 1] = this.py[i];
      this.aPos[o4 + 2] = this.pz[i];
      this.aPos[o4 + 3] = size;
      this.aCol[o4] = this.cr[i];
      this.aCol[o4 + 1] = this.cg[i];
      this.aCol[o4 + 2] = this.cb[i];
      this.aCol[o4 + 3] = this.ca[i] * fade * (t < 0.08 ? t / 0.08 : 1);
      const st = this.stretch[i];
      const ang = st > 1 && this.spin[i] === 0 && (this.vx[i] !== 0 || this.vy[i] !== 0) ? Math.atan2(this.vy[i], this.vx[i]) : this.rot[i];
      this.aMisc[i * 2] = ang;
      this.aMisc[i * 2 + 1] = st;
    }
    return n;
  }

  clear(): void {
    this.count = 0;
    this.cursor = 0;
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Director: turns world-state diffs into effects. Call observe() once per simulation tick (human play),
// update() once per display frame.
// ---------------------------------------------------------------------------------------------------------------
interface EnemySeen { hp: number; alive: boolean; stamp: number; exposed: boolean }

/** Core Warden phase colours (linear HDR-ish): I cyan, II orange, III red. */
export const BOSS_PHASE_COLORS: ReadonlyArray<readonly [number, number, number]> = [
  [0.2, 1.0, 0.9],
  [1.0, 0.55, 0.15],
  [1.0, 0.14, 0.1],
];
interface ProjSeen { x: number; y: number; kind: string; fromPlayer: boolean; stamp: number }

/** Per-kind blood/ichor colours, linear HDR-ish RGB. */
const KIND_FLUID: Record<EnemyKind3D, [number, number, number]> = {
  crawler: [0.55, 0.95, 0.2],
  stalker: [0.85, 0.12, 0.1],
  spitter: [0.25, 1.0, 0.35],
  warden: [1.0, 0.55, 0.15],
};

export interface FxTelemetry {
  activeParticles: number;
  additive: number;
  alpha: number;
  emitted: number;
  trauma: number;
  shake: number;
  hitstop: number;
  hitstopFrozen: number;
  slowmo: number;
  chroma: number;
  fovKick: number;
  popups: number;
  popupsSpawned: number;
  phaseFlash: number;
  envPulse: number;
  deathSeq: number;
  bossPhase: number;
  smoke: number;
  goreChunks: number;
  goreDecals: number;
  smokeColumns: number;
}

export class FxDirector {
  readonly add = new ParticlePool(1400);
  /** Chunks and decals (Abuse-style gore). The renderer reads `gore.level`; UI sets it. */
  readonly gore = new GoreSim();
  /** Smoke columns left by explosions, emitted per frame. */
  private readonly columns: { x: number; y: number; t: number; life: number; r: number }[] = [];
  /** Rendered weapon muzzle socket (world XY), written by the scene each frame; used for player flashes and beams. */
  readonly muzzleWorld = { x: 0, y: 0, valid: false };
  /** Last muzzle position and remaining seconds of barrel smoke. */
  private barrel = { x: 0, y: 0, t: 0 };
  readonly alpha = new ParticlePool(700);
  /** Soft round smoke puffs (normal blending), separate from the boxy debris pool. */
  readonly smoke = new ParticlePool(480);
  readonly trauma = new Trauma();
  readonly hitstop = new HitStop();
  readonly slowmo = new SlowMo();
  readonly rig = new CameraRig();
  /** Chromatic aberration kick, decays in update(). */
  chroma = 0;
  /** Set from the "Reduce flashing" option. */
  reduce = false;
  /** World-space number popups (damage, combo). */
  readonly popups = new PopupPool();
  /** Screen flash 0..1 (boss phase change / death). Decays in update(); the renderer tints the post pass. */
  phaseFlash = 0;
  /** Environment light pulse 0..1 after a boss phase change. */
  envPulse = 0;
  /** Boss phase last announced (colour of the core glow). */
  bossPhase = 1;
  /** Intro roar beat: shockwave ring, shake and a burst at the awakened Warden. */
  bossRoar(x: number, y: number): void {
    const c = BOSS_PHASE_COLORS[0];
    this.ring(x, y, 2.2, c[0], c[1], c[2]);
    this.ring(x, y - 0.8, 4.0, c[0] * 0.7, c[1] * 0.7, c[2] * 0.7);
    this.burst(x, y, c[0], c[1], c[2], 1, 36, 12);
    this.add.emit(x, y, 0.5, 0, 0, 0, 0.35, 2, 10, c[0] * 1.5, c[1] * 1.5, c[2] * 1.5, 0.7, 0, 0, 1);
    for (let i = 0; i < 12; i++) this.dustAt(x + this.rr(-3, 3), y - 2, 1, 6, 0);
    this.trauma.add(0.85);
    this.chroma = Math.max(this.chroma, 0.6);
    this.envPulse = 0.8;
    if (!this.reduce) this.phaseFlash = Math.max(this.phaseFlash, 0.35);
  }

  /** Boss death sequence clock in display seconds, -1 when idle. */
  deathT = -1;
  deathX = 0;
  deathY = 0;
  private deathNext = 0;
  private emitClock = 0;

  private seed = 0x9e3779b9;
  private lastTick = -1;
  private prevNextId = 0;
  private prevHp = -1;
  private prevGrounded = true;
  private prevVy = 0;
  private prevAcidCd = 0;
  private tClock = 0;
  private prevRailF = 0;
  private lastPx = 0;
  private prevRoom = '';
  private stamp = 0;
  private readonly enemies = new Map<string, EnemySeen>();
  private readonly projs = new Map<number, ProjSeen>();
  private trailClock = 0;

  // ---- deterministic rng (display-only; not the sim's) ----
  private rnd(): number {
    let x = this.seed;
    x ^= x << 13; x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5; x >>>= 0;
    this.seed = x;
    return x / 4294967296;
  }
  private rr(lo: number, hi: number): number {
    return lo + (hi - lo) * this.rnd();
  }

  reset(): void {
    this.add.clear();
    this.alpha.clear();
    this.smoke.clear();
    this.gore.clear();
    this.columns.length = 0;
    this.barrel.t = 0;
    this.trauma.value = 0;
    this.hitstop.reset();
    this.slowmo.reset();
    this.rig.reset();
    this.chroma = 0;
    this.phaseFlash = 0;
    this.envPulse = 0;
    this.bossPhase = 1;
    this.deathT = -1;
    this.popups.clear();
    this.lastTick = -1;
    this.enemies.clear();
    this.projs.clear();
  }

  /** Test/visual-debug helper: queue a burst without a world. */
  debugBurst(x: number, y: number): void {
    this.burst(x, y, 0.4, 1, 0.6, 0.2, 24, 9);
    this.trauma.add(0.5);
  }

  /**
   * Observe the world after a simulation tick. `quiet` records baselines only (debug fast-forward, respawn),
   * so no stale effects fire. A tick gap other than +1 is treated as quiet automatically.
   */
  observe(w: WorldState3D, quiet = false): void {
    if (w.tick === this.lastTick) return;
    const q = quiet || this.lastTick < 0 || w.tick !== this.lastTick + 1;
    this.lastTick = w.tick;
    this.stamp++;
    const p = w.player;
    const b = p.body;
    const px = b.x;
    const py = b.y;
    this.lastPx = px;

    // ---- enemies: hits and kills ----
    for (const e of w.enemies) {
      let s = this.enemies.get(e.id);
      if (!s) {
        s = { hp: e.hp, alive: e.alive, stamp: this.stamp, exposed: e.exposedTicks > 0 };
        this.enemies.set(e.id, s);
        continue;
      }
      s.stamp = this.stamp;
      if (!q) {
        const cx = e.x;
        const cy = e.y + e.height * 0.55;
        const dir = e.x >= px ? 1 : -1;
        if (s.alive && !e.alive) {
          this.onKill(e.kind, cx, cy, dir, px, py, e.y);
        } else if (s.alive && e.hp < s.hp) {
          this.onEnemyHit(e.kind, cx, cy, dir, s.hp - e.hp, e.y);
          this.damagePopup(e, s.hp - e.hp, s.exposed);
        }
      }
      // Ceiling/wall ambusher telegraph: grit sifts down while it winds up
      if (!q && e.alive && e.surface !== 'floor' && e.state === 'windup' && (w.tick & 1) === 0) {
        this.add.emit(e.x + this.rr(-0.35, 0.35), e.y + (e.surface === 'ceiling' ? 0.1 : 0.45), 0.3, this.rr(-0.25, 0.25), -this.rr(0.5, 1.6), 0, this.rr(0.4, 0.75), 0.1, 0.24, 0.62, 0.54, 0.42, 0.65, 5, 0.6, 1);
      }
      s.exposed = e.exposedTicks > 0;
      s.hp = e.hp;
      s.alive = e.alive;
    }
    if (this.enemies.size > w.enemies.length + 8) {
      for (const [id, s] of this.enemies) if (s.stamp !== this.stamp) this.enemies.delete(id);
    }

    // ---- new projectiles / beams / explosions / shockwaves (ids are monotonic) ----
    if (!q) {
      let flashedPulse = false;
      let flashedScatter = false;
      let flashedGrenade = false;
      for (const pr of w.projectiles) {
        if (pr.id < this.prevNextId || !pr.fromPlayer) continue;
        if (pr.kind === 'pulse' && !flashedPulse) { flashedPulse = true; this.muzzle('pulse', pr.x, pr.y, pr.vx, pr.vy, px); }
        else if (pr.kind === 'scatter' && !flashedScatter) { flashedScatter = true; this.muzzle('scatter', pr.x, pr.y, pr.vx, pr.vy, px); }
        else if (pr.kind === 'grenade' && !flashedGrenade) { flashedGrenade = true; this.muzzle('grenade', pr.x, pr.y, pr.vx, pr.vy, px); }
        else if (pr.kind === 'rocket') this.muzzle('rocket', pr.x, pr.y, pr.vx, pr.vy, px);
      }
      for (const bm of w.beams) {
        if (bm.id >= this.prevNextId) {
          const mz = chooseMuzzle(this.muzzleWorld, bm.x1, bm.y1);
          this.railBeam(mz.x, mz.y, bm.x2, bm.y2);
        }
      }
      for (const ex of w.explosions) {
        if (ex.id >= this.prevNextId) this.onExplosion(ex.x, ex.y, ex.maxRadius, ex.color, px, py);
      }
      for (const sw of w.shockwaves) {
        if (sw.id >= this.prevNextId) {
          this.trauma.add(0.55);
          this.chroma = Math.max(this.chroma, 0.4);
        }
        // dust kicked up by both fronts
        this.dustAt(sw.x + sw.radius, sw.y + 0.1, 2, 4.5, 1);
        this.dustAt(sw.x - sw.radius, sw.y + 0.1, 2, 4.5, -1);
      }
    }
    // projectile impacts: id vanished -> splash at last known position
    for (const pr of w.projectiles) {
      let s = this.projs.get(pr.id);
      if (!s) {
        s = { x: pr.x, y: pr.y, kind: pr.kind, fromPlayer: pr.fromPlayer, stamp: this.stamp };
        this.projs.set(pr.id, s);
      }
      s.x = pr.x; s.y = pr.y; s.stamp = this.stamp;
    }
    for (const [id, s] of this.projs) {
      if (s.stamp === this.stamp) continue;
      if (!q) this.onProjectileGone(s.kind, s.x, s.y, s.fromPlayer);
      this.projs.delete(id);
    }
    this.prevNextId = w.nextId;

    // ---- sound events -> shake / punch ----
    if (!q) {
      for (const ev of w.events) {
        switch (ev.type) {
          case 'pulse': this.trauma.add(0.05); this.rig.punch(-0.15); break;
          case 'scatter': this.trauma.add(0.2); this.rig.punch(-0.5); break;
          case 'grenade': this.trauma.add(0.16); this.rig.punch(-0.35); break;
          case 'rail': this.trauma.add(0.4); this.rig.punch(-1.1); this.chroma = Math.max(this.chroma, 0.5); break;
          case 'flamer': if (ev.value === 1) { this.trauma.add(0.05); this.rig.punch(-0.2); } break;
          case 'rocket': this.trauma.add(0.22); this.rig.punch(-0.9); break;
          case 'rocket_jump': this.trauma.add(0.28); this.chroma = Math.max(this.chroma, 0.3); this.ring(px, py + 0.6, 0.9, 1.0, 0.7, 0.3); this.dustAt(px, py + 0.1, 8, 5, 0); this.burst(px, py + 0.5, 1, 0.65, 0.2, 0.9, 16, 7); break;
          case 'slam': this.trauma.add(0.7); this.chroma = Math.max(this.chroma, 0.45); this.hitstop.request(3, true); break;
          case 'door_blast': this.trauma.add(0.45); break;
          case 'meltdown': this.trauma.add(0.9); this.chroma = Math.max(this.chroma, 0.7); break;
          case 'dash': this.rig.punch(0.9); this.dashBurst(px, py + 0.9, b.dashDirX); break;
          case 'jump': this.dustAt(px, py + 0.05, 4, 3.2, 0); break;
          case 'double_jump': this.ring(px, py + 0.4, 0.5, 1.0, 0.9, 1.0); this.trauma.add(0.04); break;
          case 'upgrade': this.ring(px, py + 1.0, 0.5, 1.0, 0.85, 0.3); this.burst(px, py + 1.0, 1, 0.9, 0.3, 0.5, 18, 5); break;
          case 'pickup': this.burst(px, py + 1.0, 0.4, 1, 0.8, 0.3, 8, 3); break;
          case 'win': this.trauma.add(0.5); break;
          case 'hazard_crush': if (ev.value === 1) { this.trauma.add(0.35); this.dustAt(px, py + 0.1, 6, 4, 0); } break;
          case 'barrel_explode': this.trauma.add(0.25); break;
          case 'elevator_start': this.trauma.add(0.12); break;
          case 'collapse': this.trauma.add(ev.value === 1 ? 0.45 : ev.value === 2 ? 0.3 : 0.15); break;
          case 'boss_phase': this.onBossPhase(w, ev.value ?? 2); break;
          case 'boss_exposed': this.onBossExposed(w); break;
          case 'boss_charge': this.onBossCharge(w); break;
          case 'boss_summon': this.onBossSummon(w); break;
          case 'wall_jump': this.onWallJump(px, py, b.wallDir); break;
          case 'dash_cancel': this.onDashCancel(px, py + 0.9); break;
          case 'combo': this.onCombo(px, py, ev.value ?? 2); break;
          case 'collect': this.onCollect(w, ev.value ?? 0, px, py); break;
          case 'secret': this.onSecret(w); break;
          case 'enemy_drop': if (ev.value === 1) this.trauma.add(0.1); break;
          case 'hive_spawn': {
            const hv = w.hives[ev.value ?? 0];
            if (hv) { this.burst(hv.x, hv.y + 0.9, 0.5, 1, 0.2, 0.5, 10, 4); this.ring(hv.x, hv.y + 0.9, 0.7, 0.6, 1, 0.3); }
            break;
          }
          case 'hive_destroyed': {
            const hv = w.hives[ev.value ?? 0];
            if (hv) { this.burst(hv.x, hv.y + 0.8, 0.6, 1, 0.2, 0.9, 36, 9); this.ring(hv.x, hv.y + 0.8, 1.6, 0.7, 1, 0.3); }
            this.trauma.add(0.6);
            break;
          }
          default: break;
        }
      }
      // landing
      if (b.grounded && !this.prevGrounded && this.prevVy < -5) {
        const impact = clamp((-this.prevVy - 5) / 14.5, 0, 1);
        this.dustAt(px, py + 0.05, 7 + Math.round(impact * 10), 3 + impact * 4, 0);
        this.trauma.add(0.06 + impact * 0.22);
        this.rig.punch(0.3 + impact * 0.6);
      }
      // stomp landing shockwave ring
      if (b.stompLanded) this.onStompLand(px, py);
      // wall slide sparks (every 2nd tick)
      if (!b.grounded && b.wallDir !== 0 && b.vy < -1.5 && (w.tick & 1) === 0) this.wallSparks(px, py + 0.9, b.wallDir);
      // dash afterimage every other tick
      if (b.state === 5 && (w.tick & 1) === 0) this.ghost(px, py + 0.92, p.facing);
      // damage taken
      if (this.prevHp >= 0 && p.hp < this.prevHp) {
        const lost = this.prevHp - p.hp;
        this.trauma.add(clamp(0.35 + lost / 80, 0.35, 0.8));
        this.chroma = Math.max(this.chroma, 1);
        this.hitstop.request(3, true);
        this.burst(px, py + 1.0, 0.9, 0.12, 0.1, 0.5, 14, 6);
        this.rig.punch(0.8);
      }
      // acid splash when the pool bites
      if (p.acidCooldown > this.prevAcidCd) this.acidSplash(px, py + 0.1, 12);
      if (w.currentRoom !== this.prevRoom && this.prevRoom !== '') this.ring(px, py + 1, 0.4, 0.6, 0.9, 1.0);
    }
    this.prevHp = p.hp;
    this.prevGrounded = b.grounded;
    this.prevVy = b.vy;
    this.prevAcidCd = p.acidCooldown;
    this.prevRoom = w.currentRoom;
  }

  /** Display-frame update: decays, trail emission, particle integration. dt is real seconds. */
  update(dt: number, w: WorldState3D): void {
    this.trauma.decay(dt);
    this.chroma = stepChroma(this.chroma, dt);
    this.trailClock += dt;
    const emitTrail = this.trailClock >= 1 / 90;
    if (emitTrail) this.trailClock = 0;
    this.tClock += dt;
    for (const pr of w.projectiles) this.projectileGlow(pr, emitTrail);
    this.frameEmitters(dt, w);
    this.armsEmitters(dt, w);
    this.gore.update(dt);
    this.smokeEmitters(dt);
    this.phaseFlash = Math.max(0, this.phaseFlash - dt * 2.4);
    this.envPulse = Math.max(0, this.envPulse - dt * 1.3);
    if (this.deathT >= 0) this.stepDeathSeq(dt, w);
    this.popups.update(dt);
    this.add.update(dt);
    this.alpha.update(dt);
    this.smoke.update(dt);
  }

  telemetry(): FxTelemetry {
    const r = (n: number): number => Math.round(n * 1000) / 1000;
    const s = this.trauma.value * this.trauma.value;
    return {
      activeParticles: this.add.count + this.alpha.count,
      additive: this.add.count,
      alpha: this.alpha.count,
      emitted: this.add.emitted + this.alpha.emitted,
      trauma: r(this.trauma.value),
      shake: r(s),
      hitstop: this.hitstop.frames,
      hitstopFrozen: this.hitstop.totalFrozen,
      slowmo: r(this.slowmo.scale),
      chroma: r(this.chroma),
      fovKick: r(this.rig.fovKick),
      popups: this.popups.count,
      popupsSpawned: this.popups.spawned,
      phaseFlash: r(this.phaseFlash),
      envPulse: r(this.envPulse),
      deathSeq: r(this.deathT),
      bossPhase: this.bossPhase,
      smoke: this.smoke.count,
      goreChunks: this.gore.chunks.count,
      goreDecals: this.gore.decals.count,
      smokeColumns: this.columns.length,
    };
  }

  // ---------------------------------------------------------------------------------------------------------
  // Round 2: boss presentation and new-mechanic recipes
  // ---------------------------------------------------------------------------------------------------------
  private wardenOf(w: WorldState3D): EnemyState3D | null {
    for (const e of w.enemies) if (e.kind === 'warden' && !e.minion) return e;
    return null;
  }

  /** Number popup for an enemy hit. Small numbers for normal enemies are skipped under "Reduce flashing". */
  private damagePopup(e: EnemyState3D, dmg: number, exposed: boolean): void {
    const n = Math.round(dmg);
    if (n <= 0) return;
    const boss = e.kind === 'warden';
    if (this.reduce && !boss) return;
    const x = e.x + this.rr(-0.35, 0.35);
    const y = e.y + e.height + 0.35;
    const t = popupTier(n, boss, exposed);
    this.popups.spawn(String(n), x, y, { size: t.size, life: t.life, r: t.rgb[0], g: t.rgb[1], b: t.rgb[2], rise: t.rise, punch: t.punch, stack: true });
  }

  private onBossPhase(w: WorldState3D, ph: number): void {
    const wd = this.wardenOf(w);
    if (!wd) return;
    const idx = clamp(ph, 1, 3) - 1;
    const c = BOSS_PHASE_COLORS[idx];
    this.bossPhase = idx + 1;
    const x = wd.x;
    const y = wd.y + wd.height * 0.55;
    // armour plates tear loose: dark, heavy, spinning
    for (let i = 0; i < 26; i++) {
      const a = this.rr(0, Math.PI * 2);
      const sp = this.rr(4, 13);
      this.alpha.emit(x + this.rr(-0.6, 0.6), y + this.rr(-0.8, 0.8), 0.45, Math.cos(a) * sp, Math.sin(a) * sp + 3, this.rr(-1, 1), this.rr(0.8, 1.5), this.rr(0.18, 0.38), 0.12, 0.26, 0.24, 0.22, 1, 18, 0.25, 1, this.rr(0, 6), this.rr(-12, 12));
    }
    this.burst(x, y, c[0], c[1], c[2], 1, 40, 14);
    this.add.emit(x, y, 0.5, 0, 0, 0, 0.3, 2.2, 9, c[0] * 1.5, c[1] * 1.5, c[2] * 1.5, 0.8, 0, 0, 1);
    this.ring(x, y, 2.4, c[0], c[1], c[2]);
    this.ring(x, y - 0.6, 4.2, c[0] * 0.8, c[1] * 0.8, c[2] * 0.8);
    this.phaseFlash = this.reduce ? 0.12 : 1;
    this.envPulse = 1;
    this.trauma.add(0.9);
    this.chroma = Math.max(this.chroma, 0.8);
    this.rig.punch(1.6);
    this.hitstop.request(4, true);
    this.slowmo.request(this.reduce ? 0.6 : 0.3, this.reduce ? 0.3 : 0.55);
  }

  private onBossExposed(w: WorldState3D): void {
    const wd = this.wardenOf(w);
    if (!wd) return;
    const x = wd.x;
    const y = wd.y + wd.height * 0.62;
    this.ring(x, y, 1.6, 1.0, 0.85, 0.3);
    this.burst(x, y, 1.0, 0.85, 0.3, 1, 18, 8);
    this.trauma.add(0.15);
  }

  private onBossCharge(w: WorldState3D): void {
    const wd = this.wardenOf(w);
    if (!wd) return;
    this.dustAt(wd.x, wd.y + 0.05, 8, 7, -wd.chargeDir);
    this.trauma.add(0.25);
    this.rig.punch(0.6);
  }

  private onBossSummon(w: WorldState3D): void {
    for (const m of w.enemies) {
      if (!m.minion || !m.alive) continue;
      this.ring(m.x, m.y + 1, 1.2, 0.7, 0.35, 1.0);
      this.burst(m.x, m.y + 0.8, 0.7, 0.4, 1.0, 1, 14, 7);
    }
  }

  private onWallJump(x: number, y: number, wallDir: number): void {
    const side = wallDir === 0 ? 1 : wallDir;
    this.ring(x + side * 0.4, y + 1.0, 0.7, 0.6, 0.9, 1.0);
    for (let i = 0; i < 8; i++) {
      this.add.emit(x + side * 0.35, y + 0.9 + this.rr(-0.5, 0.5), 0.4, -side * this.rr(2, 7), this.rr(-1, 4), 0, this.rr(0.15, 0.3), 0.14, 0.02, 0.6, 0.9, 1.5, 0.9, 6, 1.5, 4);
    }
    this.dustAt(x + side * 0.4, y + 0.6, 3, 2, -side);
  }

  private wallSparks(x: number, y: number, wallDir: number): void {
    const side = wallDir > 0 ? 1 : -1;
    for (let i = 0; i < 2; i++) {
      this.add.emit(x + side * 0.4, y + this.rr(-0.6, 0.4), 0.4, -side * this.rr(1.2, 4), this.rr(0.5, 3), 0, this.rr(0.12, 0.28), 0.1, 0.02, 1.4, 0.9, 0.45, 0.95, 14, 1.2, 4);
    }
  }

  private onDashCancel(x: number, y: number): void {
    this.add.emit(x, y, 0.5, 0, 0, 0, 0.12, 0.9, 2.2, 1.2, 1.4, 1.7, 0.85, 0, 0, 1);
    this.ring(x, y, 0.9, 0.7, 1.0, 1.0);
    this.burst(x, y, 0.5, 1.0, 1.6, 1, 10, 9);
    this.rig.punch(0.4);
  }

  private onStompLand(x: number, y: number): void {
    this.ring(x, y + 0.12, 1.8, 1.0, 0.7, 0.3);
    this.ring(x, y + 0.12, 3.2, 1.0, 0.9, 0.6);
    // flat ground-hugging wave: stretched quads fly out along the floor
    for (let i = 0; i < 14; i++) {
      const dir = i % 2 === 0 ? 1 : -1;
      this.add.emit(x, y + 0.12, 0.4, dir * this.rr(8, 15), this.rr(0, 0.6), 0, this.rr(0.18, 0.34), 0.2, 0.02, 1.3, 0.8, 0.35, 0.9, 0, 3, 5);
    }
    this.dustAt(x, y + 0.05, 14, 8, 0);
    this.trauma.add(0.55);
    this.chroma = Math.max(this.chroma, 0.35);
    this.hitstop.request(2, true);
  }

  private onCombo(x: number, y: number, chain: number): void {
    if (chain < 2) return;
    const k = Math.min(1, (chain - 2) / 5);
    this.popups.spawn(`x${chain}`, x, y + 2.5, { size: 0.7 + 0.35 * k, life: 1.0, r: 1.0, g: 0.75 - 0.4 * k, b: 0.2 - 0.1 * k, rise: 2.6, punch: 0.8 });
    this.burst(x, y + 2.2, 1.0, 0.7, 0.2, 1, 6 + chain * 2, 5);
  }

  private onCollect(w: WorldState3D, idx: number, px: number, py: number): void {
    const lg = w.collectibles[idx];
    if (!lg) return;
    // data stream: motes leave the hologram and are absorbed by the operative
    const tx = px;
    const ty = py + 1.1;
    for (let i = 0; i < 22; i++) {
      const life = this.rr(0.4, 0.8);
      const sx = lg.x + this.rr(-0.3, 0.3);
      const sy = lg.y + 0.7 + this.rr(-0.3, 0.4);
      this.add.emit(sx, sy, 0.4, (tx - sx) / life + this.rr(-1.5, 1.5), (ty - sy) / life + this.rr(0, 3), 0, life, 0.14, 0.02, 0.55, 0.45, 1.6, 0.9, 0, 0, 3);
    }
    this.ring(lg.x, lg.y + 0.7, 0.7, 0.7, 0.45, 1.0);
    this.trauma.add(0.05);
  }

  private onSecret(w: WorldState3D): void {
    // debris from the most recently opened secret wall
    const id = w.secretsFound[w.secretsFound.length - 1];
    const sec = w.level.secrets.find((sr) => sr.id === id);
    const door = sec ? w.level.solids.find((sl) => sl.doorId === sec.doorId) : undefined;
    if (!door) return;
    const cx = (door.minX + door.maxX) / 2;
    const cy = (door.minY + door.maxY) / 2;
    for (let i = 0; i < 24; i++) {
      this.alpha.emit(cx + this.rr(-0.5, 0.5), cy + this.rr(-1.4, 1.4), 0.5, this.rr(-6, 6), this.rr(1, 8), this.rr(-1, 1), this.rr(0.8, 1.4), this.rr(0.14, 0.3), 0.1, 0.38, 0.34, 0.28, 1, 18, 0.3, 1, this.rr(0, 6), this.rr(-10, 10));
    }
    this.burst(cx, cy, 1.0, 0.85, 0.3, 1, 24, 9);
    this.ring(cx, cy, 1.6, 1.0, 0.85, 0.3);
    this.trauma.add(0.35);
  }

  /** Boss death: chained explosions across the body, then a white-out and the core reveal. */
  private stepDeathSeq(dt: number, w: WorldState3D): void {
    this.deathT += dt;
    this.deathNext -= dt;
    const total = 2.0;
    if (this.deathT < total) {
      if (this.deathNext <= 0) {
        this.deathNext = 0.14 - 0.08 * (this.deathT / total);
        const x = this.deathX + this.rr(-1.1, 1.1);
        const y = this.deathY + this.rr(-1.4, 1.5);
        const big = this.rnd() < 0.3;
        this.add.emit(x, y, 0.5, 0, 0, 0, 0.2, 0.6, big ? 4 : 2.4, 1.6, 1.1, 0.6, 0.85, 0, 0, 1);
        this.burst(x, y, 1.0, 0.6, 0.2, 1, big ? 22 : 12, big ? 12 : 8);
        for (let i = 0; i < 4; i++) {
          this.alpha.emit(x, y, 0.4, this.rr(-2, 2), this.rr(1, 4), 0, this.rr(0.6, 1.1), 0.25, 0.9, 0.22, 0.2, 0.19, 0.55, -0.4, 1.4, 1);
        }
        this.trauma.add(big ? 0.45 : 0.22);
        if (big) this.ring(x, y, 1.5, 1.0, 0.6, 0.2);
      }
    } else {
      const cp = w.level.corePos;
      this.phaseFlash = this.reduce ? 0.15 : 1;
      this.add.emit(cp.x, cp.y + 1.4, 0.5, 0, 0, 0, 0.5, 3, 14, 1.6, 1.2, 0.8, 0.9, 0, 0, 1);
      this.ring(cp.x, cp.y + 1.4, 3, 1.0, 0.4, 0.15);
      this.ring(this.deathX, this.deathY, 4.5, 1.0, 0.8, 0.5);
      this.burst(cp.x, cp.y + 1.4, 1.0, 0.5, 0.2, 1, 40, 12);
      this.trauma.add(0.8);
      this.chroma = Math.max(this.chroma, 0.8);
      this.deathT = -1;
    }
  }

  /** Per-display-frame continuous emitters. Throttled to ~60/s so output does not depend on frame rate. */
  private frameEmitters(dt: number, w: WorldState3D): void {
    this.emitClock += dt;
    if (this.emitClock < 1 / 60) return;
    this.emitClock = 0;
    const p = w.player;
    const b = p.body;
    const wd = this.wardenOf(w);
    if (wd && wd.alive && wd.active) {
      const c = BOSS_PHASE_COLORS[clamp(wd.phase, 1, 3) - 1];
      const cy = wd.y + wd.height * 0.55;
      const pat = wd.bossPattern;
      if (wd.windupTicks > 0 && (pat === 'volley' || pat === 'barrage')) {
        // charge converging on the muzzle
        for (let i = 0; i < 2; i++) {
          const a = this.rr(0, Math.PI * 2);
          const r = this.rr(1.4, 2.4);
          const life = 0.22;
          this.add.emit(wd.x + Math.cos(a) * r, wd.y + 1.5 + Math.sin(a) * r, 0.5, -Math.cos(a) * r / life, -Math.sin(a) * r / life, 0, life, 0.14, 0.03, 1.5, 0.35, 0.2, 0.95, 0, 0, 3);
        }
      } else if (wd.windupTicks > 0 && pat === 'charge') {
        // scrape sparks at the heels
        this.add.emit(wd.x - wd.chargeDir * 0.9, wd.y + 0.1, 0.4, -wd.chargeDir * this.rr(1, 4), this.rr(1, 5), 0, this.rr(0.15, 0.3), 0.12, 0.02, 1.4, 0.8, 0.35, 0.9, 14, 1, 4);
      } else if (wd.bossPattern === 'charge' && wd.lungeTicks > 0) {
        for (let i = 0; i < 3; i++) {
          this.add.emit(wd.x - wd.chargeDir * 1.0, wd.y + 0.1 + this.rr(0, 0.3), 0.4, -wd.chargeDir * this.rr(3, 10), this.rr(1, 6), this.rr(-0.5, 0.5), this.rr(0.15, 0.35), 0.14, 0.02, 1.5, 0.85, 0.35, 0.95, 16, 1, 4);
        }
        this.dustAt(wd.x - wd.chargeDir, wd.y + 0.05, 1, 4, -wd.chargeDir);
      } else if (wd.windupTicks > 0 && pat === 'summon') {
        for (const m of w.enemies) {
          if (!m.minion || m.alive) continue;
          const sx = clamp(wd.x + (m.id.endsWith('m1') ? -4.2 : 4.2), 73, 95.5);
          this.add.emit(sx + this.rr(-0.8, 0.8), wd.y + 0.1, 0.4, 0, this.rr(2, 5), 0, this.rr(0.3, 0.6), 0.14, 0.02, 0.7, 0.35, 1.5, 0.9, 0, 0.5, 3);
        }
      }
      if (wd.exposedTicks > 0) {
        this.add.emit(wd.x + this.rr(-0.5, 0.5), cy + this.rr(-0.4, 0.5), 0.5, this.rr(-3, 3), this.rr(1, 6), 0, this.rr(0.2, 0.45), 0.16, 0.02, 1.6, 1.2, 0.35, 0.95, 8, 1.2, 3);
      } else if (wd.phase >= 2 && (w.tick & 3) === 0) {
        // ember drift from the damaged hull
        this.add.emit(wd.x + this.rr(-0.8, 0.8), cy + this.rr(-1, 1), 0.4, this.rr(-0.5, 0.5), this.rr(0.5, 2), 0, this.rr(0.4, 0.8), 0.1, 0.01, c[0] * 1.4, c[1] * 1.4, c[2] * 1.4, 0.8, -1, 0.5, 1);
      }
    }
    if (b.stomping) {
      this.add.emit(b.x + this.rr(-0.25, 0.25), b.y + this.rr(1.0, 1.9), 0.3, 0, this.rr(4, 9), 0, 0.2, 0.2, 0.03, 1.2, 0.8, 0.4, 0.8, 0, 0, 1, Math.PI / 2, 0.0001);
      this.add.emit(b.x, b.y + 0.4, 0.3, this.rr(-0.6, 0.6), this.rr(3, 8), 0, 0.28, 0.14, 0.02, 1.3, 0.7, 0.3, 0.8, 0, 2, 4);
    }
    if (!(p.railCharge > 0 && p.weapon === 4)) this.prevRailF = 0;
    if (p.railCharge > 0 && p.weapon === 4) {
      const f = clamp(p.railCharge / RAIL_CHARGE_TICKS, 0, 1);
      const cx = b.x;
      const cy = b.y + 1.2;
      const ax = p.aimX - cx;
      const ay = p.aimY - cy;
      const al = Math.hypot(ax, ay) || 1;
      const mz = chooseMuzzle(this.muzzleWorld, cx + (ax / al) * 1.1, cy + (ay / al) * 1.1);
      const mx = mz.x;
      const my = mz.y;
      const a = this.rr(0, Math.PI * 2);
      const r = 0.5 + 0.9 * (1 - f);
      const life = 0.14;
      this.add.emit(mx + Math.cos(a) * r, my + Math.sin(a) * r, 0.5, -Math.cos(a) * r / life, -Math.sin(a) * r / life, 0, life, 0.1 + 0.1 * f, 0.02, 0.9, 0.4, 1.7, 0.9, 0, 0, 3);
      this.add.emit(mx, my, 0.5, 0, 0, 0, 0.07, 0.18 + 0.7 * f, 0.12 + 0.7 * f, 0.9 + f, 0.4 + f * 0.3, 1.7, 0.35 + 0.5 * f, 0, 0, 1);
      if (f >= 0.92 && this.prevRailF < 0.92) {
        // Charge complete: warning ring + flash at the muzzle (audioDirector plays the matching cue).
        this.ring(mx, my, 0.9, 0.8, 0.4, 1.0);
        this.ring(mx, my, 0.5, 1.0, 0.9, 1.0);
        this.add.emit(mx, my, 0.55, 0, 0, 0, 0.12, 0.3, 1.1, 1.2, 0.8, 1.7, 0.7, 0, 0, 1);
        if (!this.reduce) this.trauma.add(0.06);
      }
      this.prevRailF = f;
    }
    if (w.coreDestroyed && w.meltdownTicks > 0 && !this.reduce && this.trauma.value < 0.1) this.trauma.add(0.012);
  }

  /**
   * Projectile look, drawn from the existing additive pool (no per-shot meshes, no lights): white core, coloured glow,
   * velocity-aligned tail, and orbiting sparks on hostile shots. Particle life spans two display frames so it never blinks.
   */
  private projectileGlow(pr: WorldState3D['projectiles'][number], emitTrail: boolean): void {
    const st = projectileStyle(pr.kind, pr.fromPlayer);
    const sp = Math.hypot(pr.vx, pr.vy);
    const dx = sp > 1e-3 ? pr.vx / sp : 1;
    const dy = sp > 1e-3 ? pr.vy / sp : 0;
    const L = 0.034;
    const z = 0.3;
    const pulse = 1 + 0.12 * Math.sin(this.tClock * 40 + pr.id);
    const g = st.glow;
    const c = st.core;
    this.add.emit(pr.x, pr.y, z, 0, 0, 0, L, st.glowSize * pulse, st.glowSize * pulse, g[0], g[1], g[2], 0.55, 0, 0, 1);
    this.add.emit(pr.x, pr.y, z + 0.02, 0, 0, 0, L, st.coreSize, st.coreSize, c[0], c[1], c[2], 0.95, 0, 0, 1);
    if (st.tail > 0 && sp > 1) {
      const len = st.glowSize * st.tail * 0.5;
      this.add.emit(pr.x - dx * len * 0.5, pr.y - dy * len * 0.5, z - 0.02, dx * 0.001, dy * 0.001, 0, L, st.glowSize * 0.55, st.glowSize * 0.55, g[0], g[1], g[2], 0.5, 0, 0, st.tail);
    }
    for (let i = 0; i < st.ringSparks; i++) {
      const a = orbitAngle(i, st.ringSparks, this.tClock);
      this.add.emit(pr.x + Math.cos(a) * st.ringRadius, pr.y + Math.sin(a) * st.ringRadius, z + 0.03, 0, 0, 0, L, 0.12, 0.12, 1, 0.55 + 0.4 * (g[1] > g[0] ? 1 : 0), 0.3, 0.9, 0, 0, 1);
    }
    if (!emitTrail) return;
    if (pr.kind === 'pulse' && pr.fromPlayer) {
      this.add.emit(pr.x, pr.y, 0.3, 0, 0, 0, 0.16, 0.2, 0.03, 0.2, 0.9, 1.0, 0.55, 0, 0, 1);
    } else if (pr.kind === 'scatter') {
      this.add.emit(pr.x, pr.y, 0.3, 0, 0, 0, 0.12, 0.13, 0.02, 1.0, 0.6, 0.15, 0.5, 0, 0, 1);
    } else if (pr.kind === 'grenade') {
      this.alpha.emit(pr.x, pr.y, 0.2, this.rr(-0.3, 0.3), this.rr(0.3, 0.9), 0, 0.7, 0.2, 0.55, 0.18, 0.16, 0.15, 0.4, -0.4, 1.2, 1);
      this.add.emit(pr.x, pr.y, 0.25, this.rr(-0.4, 0.4), this.rr(0.2, 0.8), 0, 0.5, 0.18, 0.45, 1.0, 0.45, 0.12, 0.55, 0, 1.5, 1);
    } else if (pr.kind === 'rocket') {
      // Exhaust flame and a grey smoke trail that lingers behind the rocket
      const sp = Math.hypot(pr.vx, pr.vy) || 1;
      const bx = -pr.vx / sp;
      const by = -pr.vy / sp;
      this.add.emit(pr.x + bx * 0.2, pr.y + by * 0.2, 0.3, bx * 3 + this.rr(-0.5, 0.5), by * 3 + this.rr(-0.5, 0.5), 0, this.rr(0.12, 0.22), 0.3, 0.04, 1.6, 0.8, 0.22, 0.85, 0, 2, 1);
      this.smoke.emit(pr.x + bx * 0.4, pr.y + by * 0.4, 0.3, bx * 0.8 + this.rr(-0.3, 0.3), by * 0.8 + this.rr(0.1, 0.5), this.rr(-0.2, 0.2), this.rr(0.8, 1.3), 0.14, this.rr(0.5, 0.8), 0.5, 0.48, 0.46, 0.4, -0.3, 1.4, 1, this.rr(0, 6), this.rr(-1, 1));
    } else if (pr.kind === 'enemy_acid') {
      this.add.emit(pr.x, pr.y, 0.3, this.rr(-0.3, 0.3), this.rr(-0.6, 0), 0, 0.3, 0.16, 0.03, 0.35, 1.0, 0.2, 0.6, 2.5, 0, 1);
    } else if (pr.kind === 'boss_plasma') {
      this.add.emit(pr.x, pr.y, 0.3, this.rr(-0.4, 0.4), this.rr(-0.4, 0.4), 0, 0.3, 0.3, 0.05, 1.0, 0.25, 0.15, 0.6, 0, 0, 1);
    }
  }

  // ---------------------------------------------------------------------------------------------------------
  // Effect recipes
  // ---------------------------------------------------------------------------------------------------------
  private onEnemyHit(kind: EnemyKind3D, x: number, y: number, dir: number, dmg: number, floorY: number): void {
    const f = KIND_FLUID[kind];
    this.gore.spawnHit(kind as GoreKind, x, y, floorY, dir);
    const heavy = kind === 'warden' || dmg >= 30;
    this.sparkFan(x, y, dir, 1.0, 0.85, 0.5, heavy ? 12 : 7, heavy ? 10 : 7);
    const n = Math.round((heavy ? 12 : 7) * goreScale(this.gore.level));
    for (let i = 0; i < n; i++) {
      const a = this.rr(-0.9, 0.9);
      const sp = this.rr(2, 7);
      this.alpha.emit(x, y + this.rr(-0.2, 0.2), 0.4, Math.cos(a) * sp * dir, Math.sin(a) * sp + 1.5, this.rr(-0.5, 0.5), this.rr(0.35, 0.7), this.rr(0.08, 0.16), 0.05, f[0], f[1], f[2], 0.95, 16, 0.4, 1.4);
    }
    this.add.emit(x, y, 0.5, 0, 0, 0, 0.09, 0.9, 0.2, f[0] * 1.6 + 0.4, f[1] * 1.6 + 0.4, f[2] * 1.6 + 0.4, 0.8, 0, 0, 1);
    this.hitstop.request(kind === 'warden' ? 3 : heavy ? 3 : 2);
    if (kind === 'warden') {
      this.trauma.add(0.1);
      this.chroma = Math.max(this.chroma, 0.2);
    }
  }

  private onKill(kind: EnemyKind3D, x: number, y: number, dir: number, _px: number, _py: number, floorY: number): void {
    const f = KIND_FLUID[kind];
    const boss = kind === 'warden';
    this.gore.spawnKill(kind as GoreKind, x, y, floorY, dir);
    if (kind === 'crawler' || kind === 'spitter') this.acidSteam(x, floorY + 0.2, kind === 'crawler' ? 6 : 4);
    const gs = goreScale(this.gore.level);
    const n = boss ? 80 : 26;
    for (let i = 0; i < n; i++) {
      if (i % 3 !== 0 && this.rnd() >= gs) continue; // low/off: fewer fluid droplets, sparks stay
      const a = this.rr(0, Math.PI * 2);
      const sp = this.rr(2, boss ? 15 : 10);
      const vx = Math.cos(a) * sp + dir * 2;
      const vy = Math.sin(a) * sp + 2;
      if (i % 3 === 0) this.add.emit(x, y, 0.4, vx, vy, this.rr(-1, 1), this.rr(0.25, 0.6), this.rr(0.1, 0.2), 0.02, 1.2, 0.95, 0.6, 0.9, 12, 0.6, 3);
      else this.alpha.emit(x, y, 0.4, vx, vy, this.rr(-1, 1), this.rr(0.5, boss ? 1.4 : 1.0), this.rr(0.1, boss ? 0.34 : 0.24), 0.06, f[0] * 0.9, f[1] * 0.9, f[2] * 0.9, 1, 17, 0.3, 1, this.rr(0, 6), this.rr(-9, 9));
    }
    this.add.emit(x, y, 0.5, 0, 0, 0, 0.22, boss ? 3 : 1.4, boss ? 8 : 3.6, 1.5, 1.2, 0.8, 0.85, 0, 0, 1);
    this.ring(x, y, boss ? 1.4 : 0.6, f[0], f[1], f[2]);
    this.trauma.add(boss ? 1.0 : 0.22);
    this.chroma = Math.max(this.chroma, boss ? 0.9 : 0.35);
    this.rig.punch(boss ? 2 : 0.5);
    this.hitstop.request(boss ? 6 : 4, true);
    if (boss) {
      this.slowmo.request(0.25, 0.85);
      this.deathT = 0;
      this.deathNext = 0;
      this.deathX = x;
      this.deathY = y;
    }
    else if (kind === 'stalker') this.slowmo.request(0.55, 0.14);
  }

  private onExplosion(x: number, y: number, radius: number, color: number, px: number, py: number): void {
    const cr = ((color >> 16) & 255) / 255;
    const cg = ((color >> 8) & 255) / 255;
    const cb = (color & 255) / 255;
    const d = Math.hypot(x - px, y - py);
    this.trauma.add(clamp((0.35 + radius * 0.09) * (1 - d / 18), 0, 0.9));
    this.chroma = Math.max(this.chroma, clamp(0.5 * (1 - d / 14), 0, 0.5));
    this.add.emit(x, y, 0.5, 0, 0, 0, 0.28, 0.6, radius * 1.5, 1.6, 1.2 + cg * 0.3, 0.7 + cb * 0.3, 0.8, 0, 0, 1);
    this.burst(x, y, Math.max(cr, 0.6), Math.max(cg, 0.5), cb + 0.2, 1, 30, 4 + radius * 2.2);
    for (let i = 0; i < 14; i++) {
      const a = this.rr(0, Math.PI);
      const sp = this.rr(3, 6 + radius * 1.6);
      this.alpha.emit(x, y, 0.4, Math.cos(a) * sp, Math.sin(a) * sp, this.rr(-1, 1), this.rr(0.5, 1.0), this.rr(0.12, 0.3), 0.05, 0.25, 0.22, 0.2, 1, 14, 0.5, 1, this.rr(0, 6), this.rr(-8, 8));
    }
    for (let i = 0; i < 9; i++) {
      this.alpha.emit(x + this.rr(-0.5, 0.5) * radius * 0.4, y + this.rr(-0.2, 0.3), 0.3, this.rr(-1, 1), this.rr(0.8, 2.4), 0, this.rr(0.9, 1.6), 0.4, radius * 0.7, 0.2, 0.18, 0.17, 0.5, -0.5, 1.2, 1);
    }
    this.ring(x, y, radius * 0.6, Math.max(cr, 0.8), Math.max(cg, 0.5), cb);
    if (this.columns.length < 8) this.columns.push({ x, y, t: 0, life: 2.2 + radius * 0.35, r: radius });
  }

  private onProjectileGone(kind: string, x: number, y: number, fromPlayer: boolean): void {
    if (kind === 'enemy_acid') {
      this.acidSplash(x, y, 9);
    } else if (kind === 'boss_plasma') {
      this.burst(x, y, 1, 0.3, 0.15, 0.8, 10, 6);
    } else if (fromPlayer && kind === 'pulse') {
      this.burst(x, y, 0.3, 0.9, 1, 0.9, 6, 5);
    } else if (fromPlayer && kind === 'scatter') {
      this.burst(x, y, 1, 0.75, 0.3, 0.8, 4, 4);
      // Point-blank blast: a flat impact wave on the target side sells the knockback.
      if (Math.abs(x - this.lastPx) < 5) this.scatterImpactWave(x, y, x >= this.lastPx ? 1 : -1);
    }
  }

  private scatterImpactWave(x: number, y: number, dir: number): void {
    this.add.emit(x, y, 0.45, dir * 0.001, 0, 0, 0.2, 0.5, 2.2, 1, 0.7, 0.3, 0.55, 0, 0, 1);
    this.add.emit(x + dir * 0.2, y, 0.45, dir * 6, 0, 0, 0.18, 0.5, 0.2, 1, 0.8, 0.45, 0.6, 0, 3, 3);
    this.add.emit(x + dir * 0.2, y + 0.3, 0.45, dir * 5, 1.5, 0, 0.16, 0.35, 0.1, 1, 0.8, 0.45, 0.5, 0, 3, 3);
    this.add.emit(x + dir * 0.2, y - 0.3, 0.45, dir * 5, -1.5, 0, 0.16, 0.35, 0.1, 1, 0.8, 0.45, 0.5, 0, 3, 3);
    this.dustAt(x, y - 0.5, 3, 3, dir);
  }

  private muzzle(kind: 'pulse' | 'scatter' | 'grenade' | 'rocket', sx: number, sy: number, vx: number, vy: number, px: number): void {
    const mz = chooseMuzzle(this.muzzleWorld, sx, sy);
    const x = mz.x;
    const y = mz.y;
    const len = Math.hypot(vx, vy) || 1;
    const dx = vx / len;
    const dy = vy / len;
    const dir = dx >= 0 ? 1 : -1;
    this.muzzleSmoke(kind, x, y, dx, dy);
    if (kind === 'pulse') {
      this.add.emit(x, y, 0.5, dx, dy, 0, 0.06, 0.26, 0.08, 0.25, 0.7, 1.0, 0.8, 0, 0, 1);
      for (let i = 0; i < 4; i++) {
        const a = Math.atan2(dy, dx) + this.rr(-0.35, 0.35);
        const sp = this.rr(8, 16);
        this.add.emit(x, y, 0.45, Math.cos(a) * sp, Math.sin(a) * sp, 0, this.rr(0.08, 0.16), 0.12, 0.02, 0.3, 0.95, 1.5, 0.9, 0, 3, 4);
      }
      this.casing(px, y, dir, 0.9);
    } else if (kind === 'scatter') {
      this.add.emit(x, y, 0.5, dx, dy, 0, 0.08, 0.5, 0.15, 1.0, 0.7, 0.28, 0.8, 0, 0, 1);
      for (let i = 0; i < 12; i++) {
        const a = Math.atan2(dy, dx) + this.rr(-0.55, 0.55);
        const sp = this.rr(6, 18);
        this.add.emit(x, y, 0.45, Math.cos(a) * sp, Math.sin(a) * sp, 0, this.rr(0.1, 0.24), 0.14, 0.02, 1.4, 0.8, 0.25, 0.95, 4, 2.6, 4);
      }
      for (let i = 0; i < 4; i++) {
        this.alpha.emit(x, y, 0.4, dx * this.rr(1, 4) + this.rr(-0.4, 0.4), dy * this.rr(1, 4) + this.rr(0.2, 0.9), 0, this.rr(0.4, 0.7), 0.15, 0.5, 0.45, 0.42, 0.4, 0.5, -0.6, 1.5, 1);
      }
      this.casing(px, y, dir, 1.4);
    } else if (kind === 'rocket') {
      // Launch flash plus a backblast of smoke and sparks thrown the opposite way
      this.add.emit(x, y, 0.5, dx, dy, 0, 0.12, 0.7, 0.2, 1.7, 0.9, 0.3, 0.85, 0, 0, 1);
      for (let i = 0; i < 10; i++) {
        const a = Math.atan2(-dy, -dx) + this.rr(-0.5, 0.5);
        const sp = this.rr(4, 12);
        this.add.emit(x, y, 0.45, Math.cos(a) * sp, Math.sin(a) * sp, 0, this.rr(0.12, 0.3), 0.16, 0.02, 1.6, 0.8, 0.25, 0.9, 4, 2.4, 4);
      }
      for (let i = 0; i < 6; i++) {
        this.smoke.emit(x - dx * 0.5, y - dy * 0.5, 0.4, -dx * this.rr(1, 4) + this.rr(-0.6, 0.6), -dy * this.rr(1, 4) + this.rr(0, 0.8), 0, this.rr(0.8, 1.3), 0.2, 0.8, 0.55, 0.52, 0.5, 0.45, -0.5, 1.6, 1, this.rr(0, 6), this.rr(-1, 1));
      }
    } else {
      this.add.emit(x, y, 0.5, dx, dy, 0, 0.1, 0.42, 0.12, 1.0, 0.55, 0.15, 0.8, 0, 0, 1);
      for (let i = 0; i < 6; i++) {
        this.alpha.emit(x, y, 0.4, dx * this.rr(1, 5), dy * this.rr(1, 5) + this.rr(0, 1), 0, this.rr(0.5, 0.9), 0.2, 0.7, 0.4, 0.38, 0.36, 0.55, -0.4, 1.5, 1);
      }
    }
  }

  /**
   * Round 6 arms, per display frame (render-only, reads the sim): the Flamer stream from the muzzle, flames on burning enemies,
   * glowing floor embers (decals) and steam where embers lie over acid. Uses the existing particle pools.
   */
  private armsEmitters(dt: number, w: WorldState3D): void {
    const p = w.player;
    const b = p.body;
    const k = this.reduce ? 0.5 : 1;
    if (p.weapon === 5 && p.muzzleFlashTicks > 0 && p.hp > 0 && w.status === 'playing') {
      const cx = b.x;
      const cy = b.y + 1.12;
      const ax = p.aimX - cx;
      const ay = p.aimY - cy;
      const al = Math.hypot(ax, ay) || 1;
      const dx = ax / al;
      const dy = ay / al;
      const mz = chooseMuzzle(this.muzzleWorld, cx + dx * 0.72, cy + dy * 0.72);
      const n = Math.round(dt * 150 * k + this.rnd());
      for (let i = 0; i < n; i++) {
        const a = Math.atan2(dy, dx) + this.rr(-0.26, 0.26);
        const sp = this.rr(9, 15);
        // hot core, orange body, then dark smoke at the tip of the cone
        this.add.emit(mz.x, mz.y, 0.45, Math.cos(a) * sp, Math.sin(a) * sp + 0.6, this.rr(-0.4, 0.4), this.rr(0.18, 0.3), 0.14, this.rr(0.5, 0.8), 1.8, this.rr(0.55, 0.9), 0.15, 0.7, -1.5, 1.2, 1);
        if (this.rnd() < 0.5) this.add.emit(mz.x, mz.y, 0.4, Math.cos(a) * sp * 0.8, Math.sin(a) * sp * 0.8 + 0.8, 0, this.rr(0.12, 0.2), 0.08, 0.3, 1.9, 1.6, 0.8, 0.9, 0, 1.6, 1);
      }
      if (this.rnd() < dt * 20 * k) {
        this.smoke.emit(mz.x + dx * 3.2, mz.y + dy * 3.2, 0.42, dx * 1.2 + this.rr(-0.4, 0.4), 1.2 + this.rr(0, 0.8), 0, this.rr(0.8, 1.3), 0.3, 1.0, 0.18, 0.17, 0.16, 0.4, -0.6, 1.2, 1, this.rr(0, 6), this.rr(-1, 1));
      }
    }
    for (const e of w.enemies) {
      if (e.burnTicks <= 0 || !e.alive) continue;
      if (this.rnd() < dt * 46 * k) {
        this.add.emit(e.x + this.rr(-e.radius, e.radius), e.y + this.rr(0.1, e.height), 0.45, this.rr(-0.5, 0.5), this.rr(1.8, 3.6), 0, this.rr(0.25, 0.45), 0.3, 0.04, 1.7, this.rr(0.5, 0.85), 0.15, 0.85, -1.2, 0.8, 1);
      }
      if (this.rnd() < dt * 9 * k) {
        this.smoke.emit(e.x, e.y + e.height, 0.4, this.rr(-0.3, 0.3), this.rr(0.8, 1.6), 0, this.rr(0.8, 1.2), 0.18, 0.7, 0.22, 0.2, 0.19, 0.4, -0.6, 1, 1, this.rr(0, 6), this.rr(-1, 1));
      }
    }
    for (const m of w.embers) {
      const fade = m.ticksLeft / m.maxTicks;
      // the decal: a flat glow strip re-emitted every frame so it never blinks
      this.add.emit(m.x, m.y + 0.04, 0.35, 0.001, 0, 0, 0.034, 0.9, 0.9, 1.3 * fade + 0.2, 0.42 * fade + 0.05, 0.08, 0.5 * fade + 0.1, 0, 0, 2.6);
      if (this.rnd() < dt * 7 * fade * k) {
        this.add.emit(m.x + this.rr(-0.4, 0.4), m.y + 0.08, 0.4, this.rr(-0.2, 0.2), this.rr(0.8, 2.2), 0, this.rr(0.4, 0.8), 0.08, 0.01, 1.5, 0.6, 0.15, 0.9, -0.5, 0.5, 1);
      }
      if (m.steam && this.rnd() < dt * 14 * k) {
        this.smoke.emit(m.x + this.rr(-0.4, 0.4), m.y + 0.1, 0.4, this.rr(-0.3, 0.3), this.rr(1.0, 2.2), 0, this.rr(1.0, 1.6), 0.25, 0.9, 0.78, 0.82, 0.8, 0.4, -0.5, 1, 1, this.rr(0, 6), this.rr(-1, 1));
      }
    }
  }

  /** Rail-Cannon: bright muzzle bloom plus sparks and drifting motes along the beam, impact flare at the end. */
  private railBeam(x1: number, y1: number, x2: number, y2: number): void {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    this.add.emit(x1, y1, 0.5, 0, 0, 0, 0.15, 0.5, 0.12, 1.0, 0.4, 1.2, 0.85, 0, 0, 1);
    this.ring(x1, y1, 0.9, 0.9, 0.45, 1.0);
    const n = Math.min(26, 6 + Math.floor(len * 1.2));
    for (let i = 0; i < n; i++) {
      const t = this.rnd();
      const x = x1 + dx * t;
      const y = y1 + dy * t;
      this.add.emit(x, y, 0.4, this.rr(-1.5, 1.5), this.rr(-1.5, 1.5), 0, this.rr(0.18, 0.5), this.rr(0.1, 0.2), 0.02, 0.9, 0.4, 1.6, 0.8, 0, 2.5, 3);
    }
    this.add.emit(x2, y2, 0.5, 0, 0, 0, 0.18, 0.7, 0.2, 1.0, 0.4, 1.2, 0.85, 0, 0, 1);
    this.burst(x2, y2, 0.9, 0.5, 1.7, 1, 14, 8);
  }

  private acidSplash(x: number, y: number, n: number): void {
    for (let i = 0; i < n; i++) {
      const a = this.rr(0.3, Math.PI - 0.3);
      const sp = this.rr(2.5, 7);
      this.alpha.emit(x, y, 0.4, Math.cos(a) * sp, Math.sin(a) * sp, this.rr(-0.6, 0.6), this.rr(0.4, 0.8), this.rr(0.07, 0.14), 0.03, 0.3, 1.0, 0.18, 0.95, 18, 0.2, 1.3);
    }
    this.add.emit(x, y + 0.1, 0.4, 0, 0, 0, 0.18, 0.7, 0.2, 0.3, 1.0, 0.3, 0.7, 0, 0, 1);
  }

  /** Gun smoke: a soft puff that spreads from the muzzle, plus wisps that keep rising from the barrel for a moment. */
  private muzzleSmoke(kind: 'pulse' | 'scatter' | 'grenade' | 'rocket', x: number, y: number, dx: number, dy: number): void {
    const heavy = kind !== 'pulse';
    const n = kind === 'scatter' ? 5 : kind === 'grenade' ? 4 : 2;
    for (let i = 0; i < n; i++) {
      const sp = this.rr(0.6, heavy ? 3.4 : 2.0);
      this.smoke.emit(x, y, 0.42, dx * sp + this.rr(-0.5, 0.5), dy * sp + this.rr(0.1, 0.8), this.rr(-0.4, 0.4), this.rr(0.7, 1.3), this.rr(0.1, 0.18), this.rr(0.5, heavy ? 0.9 : 0.6), 0.55, 0.52, 0.5, heavy ? 0.4 : 0.28, -0.7, 1.9, 1, this.rr(0, 6), this.rr(-1.5, 1.5));
    }
    this.barrel.x = x;
    this.barrel.y = y;
    this.barrel.t = heavy ? 0.9 : 0.5;
  }

  /** Green vapour rising from a dissolving acid creature. */
  private acidSteam(x: number, y: number, n: number): void {
    for (let i = 0; i < n; i++) {
      this.smoke.emit(x + this.rr(-0.5, 0.5), y, 0.4, this.rr(-0.4, 0.4), this.rr(0.8, 2.0), this.rr(-0.3, 0.3), this.rr(0.9, 1.6), 0.2, this.rr(0.7, 1.2), 0.3, 0.55, 0.16, 0.38, -0.8, 1.1, 1, this.rr(0, 6), this.rr(-1, 1));
    }
  }

  /** Per-frame smoke: explosion columns that rise and widen, and barrel wisps after a shot. */
  private smokeEmitters(dt: number): void {
    if (this.barrel.t > 0) {
      this.barrel.t -= dt;
      if (this.rnd() < dt * 22) {
        this.smoke.emit(this.barrel.x + this.rr(-0.1, 0.1), this.barrel.y, 0.42, this.rr(-0.25, 0.25), this.rr(0.5, 1.1), 0, this.rr(0.8, 1.4), 0.07, 0.4, 0.5, 0.48, 0.46, 0.2, -0.5, 1.6, 1, this.rr(0, 6), this.rr(-1, 1));
      }
    }
    for (let i = this.columns.length - 1; i >= 0; i--) {
      const c = this.columns[i];
      c.t += dt;
      if (c.t >= c.life) {
        this.columns.splice(i, 1);
        continue;
      }
      const k = 1 - c.t / c.life;
      if (this.rnd() < dt * 26 * k) {
        const w = Math.max(0.5, c.r * 0.28);
        this.smoke.emit(c.x + this.rr(-w, w), c.y + this.rr(0, 0.4) + c.t * 0.5, 0.35, this.rr(-0.35, 0.35), this.rr(1.6, 3.0), this.rr(-0.3, 0.3), this.rr(1.2, 2.0), 0.35 + c.r * 0.12, 0.9 + c.r * 0.35, 0.16 + 0.14 * k, 0.15 + 0.12 * k, 0.14 + 0.1 * k, 0.5 * k + 0.15, -0.3, 1.2, 1, this.rr(0, 6), this.rr(-0.8, 0.8));
      }
      if (c.t < 0.8 && this.rnd() < dt * 18) {
        // glowing embers at the base while it is still hot
        this.add.emit(c.x + this.rr(-0.5, 0.5), c.y, 0.4, this.rr(-1, 1), this.rr(1, 3), 0, this.rr(0.3, 0.7), 0.08, 0.02, 1.4, 0.6, 0.2, 0.8, 4, 1, 1);
      }
    }
  }

  private casing(x: number, y: number, dir: number, size: number): void {
    this.alpha.emit(x - dir * 0.1, y, 0.5, -dir * this.rr(1.5, 3.5), this.rr(3.2, 5.5), this.rr(-0.5, 0.5), 0.85, 0.07 * size, 0.07 * size, 0.95, 0.75, 0.3, 1, 22, 0.1, 1.7, this.rr(0, 6), this.rr(-18, 18));
  }

  /** Spark fan toward `dir` (+1/-1) around the horizontal. */
  private sparkFan(x: number, y: number, dir: number, r: number, g: number, b: number, n: number, speed: number): void {
    for (let i = 0; i < n; i++) {
      const a = this.rr(-0.8, 0.8);
      const sp = this.rr(speed * 0.5, speed * 1.5);
      this.add.emit(x, y, 0.5, Math.cos(a) * sp * dir, Math.sin(a) * sp + 1, 0, this.rr(0.12, 0.3), 0.13, 0.02, r * 1.4, g * 1.4, b * 1.4, 0.95, 12, 1.5, 4);
    }
  }

  /** Radial spark burst. */
  private burst(x: number, y: number, r: number, g: number, b: number, a: number, n: number, speed: number): void {
    for (let i = 0; i < n; i++) {
      const ang = this.rr(0, Math.PI * 2);
      const sp = this.rr(speed * 0.3, speed);
      this.add.emit(x, y, 0.5, Math.cos(ang) * sp, Math.sin(ang) * sp, 0, this.rr(0.15, 0.45), this.rr(0.1, 0.22), 0.02, r * 1.5, g * 1.5, b * 1.5, a, 9, 1.8, 4);
    }
  }

  private ring(x: number, y: number, size: number, r: number, g: number, b: number): void {
    this.add.emit(x, y, 0.35, 0, 0, 0, 0.3, size * 0.4, size * 2.6, r, g, b, 0.35, 0, 0, 1);
  }

  private dustAt(x: number, y: number, n: number, spread: number, bias: number): void {
    for (let i = 0; i < n; i++) {
      const side = bias !== 0 ? bias : this.rnd() < 0.5 ? -1 : 1;
      this.alpha.emit(x + this.rr(-0.2, 0.2), y, 0.45, side * this.rr(0.4, 1) * spread * 0.5, this.rr(0.3, 1.1), this.rr(-0.4, 0.4), this.rr(0.3, 0.6), this.rr(0.12, 0.22), this.rr(0.35, 0.6), 0.62, 0.58, 0.52, 0.42, -0.4, 2.8, 1);
    }
  }

  private dashBurst(x: number, y: number, dirX: number): void {
    const back = dirX === 0 ? -1 : -Math.sign(dirX);
    for (let i = 0; i < 10; i++) {
      this.add.emit(x, y + this.rr(-0.8, 0.8), 0.4, back * this.rr(4, 12), this.rr(-0.8, 0.8), 0, this.rr(0.12, 0.26), 0.18, 0.02, 0.35, 0.85, 1.4, 0.85, 0, 3, 5);
    }
    this.dustAt(x, y - 0.85, 4, 4, back);
  }

  /** Dash afterimage: a soft vertical blob that lingers where the operative was. */
  private ghost(x: number, y: number, facing: number): void {
    this.add.emit(x - facing * 0.05, y, 0.1, 0, 0, 0, 0.26, 1.0, 0.7, 0.2, 0.75, 1.3, 0.5, 0, 0, 1.9, Math.PI / 2, 0.0001);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Post-process parameters: per-sector colour grade (uniform based, no LUT), low-HP pulse, chroma kick.
// ---------------------------------------------------------------------------------------------------------------
export interface Grade {
  gain: [number, number, number];
  lift: [number, number, number];
  sat: number;
  contrast: number;
  vignette: number;
}

export const SECTOR_GRADE: Record<string, Grade> = {
  // Round 3 mood pass: rust brown, drab green, orange highlights (Abuse palette). Lift stays low so shadows go deep.
  airlock: { gain: [1.0, 1.0, 0.97], lift: [0.004, 0.004, 0.006], sat: 0.92, contrast: 1.1, vignette: 0.5 },
  shaft: { gain: [1.08, 1.0, 0.86], lift: [0.008, 0.004, 0], sat: 0.98, contrast: 1.12, vignette: 0.54 },
  mines: { gain: [1.14, 0.98, 0.78], lift: [0.012, 0.005, 0], sat: 1.05, contrast: 1.14, vignette: 0.6 },
  biolabs: { gain: [0.92, 1.07, 0.86], lift: [0, 0.008, 0.002], sat: 1.0, contrast: 1.11, vignette: 0.54 },
  security: { gain: [1.04, 0.96, 0.96], lift: [0.004, 0.002, 0.006], sat: 0.96, contrast: 1.12, vignette: 0.56 },
  core: { gain: [1.16, 0.9, 0.8], lift: [0.014, 0, 0.002], sat: 1.1, contrast: 1.16, vignette: 0.62 },
};

export interface PostParams {
  gain: [number, number, number];
  lift: [number, number, number];
  sat: number;
  contrast: number;
  vignette: number;
  grain: number;
  chroma: number;
  /** 0..1 how hurt the player is (only below 30% HP). */
  lowHp: number;
  /** 0..1 red pulse envelope. */
  pulse: number;
  /** Additive screen flash (boss phase change, death, meltdown siren). */
  flash: [number, number, number];
}

export function createPostParams(): PostParams {
  return { gain: [1, 1, 1], lift: [0, 0, 0], sat: 1, contrast: 1, vignette: 0.45, grain: 0.035, chroma: 0, lowHp: 0, pulse: 0, flash: [0, 0, 0] };
}

/** Ease `p` toward the sector grade and refresh per-frame terms. In place, no allocation. */
export function stepPostParams(p: PostParams, sector: string, dt: number, tSec: number, hpFrac: number, chroma: number, reduce: boolean): void {
  const g = SECTOR_GRADE[sector] ?? SECTOR_GRADE.shaft;
  const k = 1 - Math.exp(-dt * 2.2);
  for (let i = 0; i < 3; i++) {
    p.gain[i] += (g.gain[i] - p.gain[i]) * k;
    p.lift[i] += (g.lift[i] - p.lift[i]) * k;
  }
  p.sat += (g.sat - p.sat) * k;
  p.contrast += (g.contrast - p.contrast) * k;
  p.vignette += (g.vignette - p.vignette) * k;
  p.grain = reduce ? 0.02 : 0.04;
  p.chroma = chroma * (reduce ? 0.25 : 1);
  const low = clamp((0.3 - hpFrac) / 0.3, 0, 1);
  p.lowHp = hpFrac > 0 ? low : 0;
  // heartbeat: faster as HP drops; reduced mode holds a steady tint instead of pulsing
  const rate = 4.5 + low * 5;
  p.pulse = reduce ? 0.5 : 0.5 + 0.5 * Math.sin(tSec * rate) * Math.abs(Math.sin(tSec * rate * 0.5));
}
