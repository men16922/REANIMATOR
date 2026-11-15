// Abuse-style gore, pure logic (no WebGL). Display-only: it reads kill events and never touches the simulation.
// ChunkPool: tumbling meat chunks with floor bounces. DecalPool: floor and wall splatters with a lifetime fade.
// GPU upload lives in gore3dGfx.ts (one instanced draw per pool).

export type GoreLevel = 'full' | 'low' | 'off';
export const GORE_LEVELS: readonly GoreLevel[] = ['full', 'low', 'off'];

export function parseGoreLevel(v: string | null | undefined): GoreLevel {
  return v === 'low' || v === 'off' ? v : 'full';
}

/** Multiplier on chunk and decal counts. */
export function goreScale(level: GoreLevel): number {
  return level === 'full' ? 1 : level === 'low' ? 0.35 : 0;
}

export type GoreKind = 'stalker' | 'crawler' | 'spitter' | 'warden';

export interface GoreRecipe {
  chunks: number;
  hitChunks: number;
  sizeLo: number;
  sizeHi: number;
  speed: number;
  decals: number;
  decalSize: number;
  /** Linear RGB palette; chunks pick one at random. */
  palette: ReadonlyArray<readonly [number, number, number]>;
  /** Splatter colour (decals). */
  splat: readonly [number, number, number];
  /** Acid kinds also leave a faint green glow on the decal. */
  acid: boolean;
}

export const GORE_RECIPES: Record<GoreKind, GoreRecipe> = {
  stalker: {
    chunks: 14, hitChunks: 2, sizeLo: 0.12, sizeHi: 0.34, speed: 10, decals: 6, decalSize: 1.5,
    palette: [[0.42, 0.04, 0.03], [0.62, 0.07, 0.05], [0.22, 0.03, 0.03], [0.55, 0.45, 0.36]],
    splat: [0.38, 0.03, 0.03], acid: false,
  },
  crawler: {
    chunks: 12, hitChunks: 2, sizeLo: 0.1, sizeHi: 0.3, speed: 9, decals: 6, decalSize: 1.6,
    palette: [[0.22, 0.6, 0.06], [0.36, 0.8, 0.1], [0.1, 0.3, 0.04], [0.5, 0.55, 0.12]],
    splat: [0.2, 0.55, 0.06], acid: true,
  },
  spitter: {
    chunks: 12, hitChunks: 2, sizeLo: 0.1, sizeHi: 0.3, speed: 9, decals: 5, decalSize: 1.4,
    palette: [[0.5, 0.55, 0.08], [0.32, 0.5, 0.1], [0.55, 0.12, 0.06], [0.2, 0.28, 0.05]],
    splat: [0.34, 0.5, 0.07], acid: true,
  },
  warden: {
    chunks: 34, hitChunks: 3, sizeLo: 0.2, sizeHi: 0.6, speed: 15, decals: 12, decalSize: 3.2,
    palette: [[0.3, 0.3, 0.32], [0.55, 0.28, 0.08], [0.5, 0.06, 0.05], [0.14, 0.14, 0.16]],
    splat: [0.45, 0.2, 0.05], acid: false,
  },
};

export const CHUNK_CAPACITY = 160;
export const DECAL_CAPACITY = 96;
export const DECAL_LIFE = 22;
const DECAL_FADE = 6;
const CHUNK_LIFE = 7;
const GRAVITY = 26;

/** Alpha envelope for a decal: opaque, then a linear fade over the last DECAL_FADE seconds. */
export function decalFade(age: number, life: number): number {
  const left = life - age;
  if (left <= 0) return 0;
  return left >= DECAL_FADE ? 1 : left / DECAL_FADE;
}

export class DecalPool {
  readonly capacity: number;
  count = 0;
  spawned = 0;
  private cursor = 0;
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly z: Float32Array;
  readonly size: Float32Array;
  readonly rot: Float32Array;
  /** 1 = floor (lies in xz), 0 = wall (faces +z). */
  readonly floor: Float32Array;
  readonly r: Float32Array;
  readonly g: Float32Array;
  readonly b: Float32Array;
  readonly age: Float32Array;
  readonly life: Float32Array;

  constructor(capacity: number) {
    this.capacity = capacity;
    const f = (): Float32Array => new Float32Array(capacity);
    this.x = f(); this.y = f(); this.z = f(); this.size = f(); this.rot = f(); this.floor = f();
    this.r = f(); this.g = f(); this.b = f(); this.age = f(); this.life = f();
  }

  add(x: number, y: number, z: number, size: number, rot: number, floor: boolean, r: number, g: number, b: number, life = DECAL_LIFE): void {
    let i: number;
    if (this.count < this.capacity) {
      i = this.count++;
    } else {
      i = this.cursor; // pool full: the oldest slot (round-robin) is reused
      this.cursor = (this.cursor + 1) % this.capacity;
    }
    this.x[i] = x; this.y[i] = y; this.z[i] = z; this.size[i] = size; this.rot[i] = rot;
    this.floor[i] = floor ? 1 : 0;
    this.r[i] = r; this.g[i] = g; this.b[i] = b; this.age[i] = 0; this.life[i] = life;
    this.spawned++;
  }

  update(dt: number): void {
    for (let i = this.count - 1; i >= 0; i--) {
      this.age[i] += dt;
      if (this.age[i] >= this.life[i]) this.removeAt(i);
    }
  }

  private removeAt(i: number): void {
    const l = --this.count;
    if (i === l) return;
    const arrs = [this.x, this.y, this.z, this.size, this.rot, this.floor, this.r, this.g, this.b, this.age, this.life];
    for (const a of arrs) a[i] = a[l];
  }

  clear(): void {
    this.count = 0;
    this.cursor = 0;
  }
}

export class ChunkPool {
  readonly capacity: number;
  count = 0;
  spawned = 0;
  private cursor = 0;
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly z: Float32Array;
  readonly vx: Float32Array;
  readonly vy: Float32Array;
  readonly vz: Float32Array;
  readonly rx: Float32Array;
  readonly ry: Float32Array;
  readonly sx: Float32Array;
  readonly sy: Float32Array;
  readonly sz: Float32Array;
  readonly spinX: Float32Array;
  readonly spinY: Float32Array;
  readonly floorY: Float32Array;
  readonly r: Float32Array;
  readonly g: Float32Array;
  readonly b: Float32Array;
  readonly age: Float32Array;
  readonly bounces: Uint8Array;
  readonly kind: Uint8Array;

  constructor(capacity: number) {
    this.capacity = capacity;
    const f = (): Float32Array => new Float32Array(capacity);
    this.x = f(); this.y = f(); this.z = f(); this.vx = f(); this.vy = f(); this.vz = f();
    this.rx = f(); this.ry = f(); this.sx = f(); this.sy = f(); this.sz = f();
    this.spinX = f(); this.spinY = f(); this.floorY = f();
    this.r = f(); this.g = f(); this.b = f(); this.age = f();
    this.bounces = new Uint8Array(capacity);
    this.kind = new Uint8Array(capacity);
  }

  add(x: number, y: number, z: number, vx: number, vy: number, vz: number, sx: number, sy: number, sz: number,
    floorY: number, r: number, g: number, b: number, rx: number, ry: number, spinX: number, spinY: number, kind: number): void {
    let i: number;
    if (this.count < this.capacity) {
      i = this.count++;
    } else {
      i = this.cursor;
      this.cursor = (this.cursor + 1) % this.capacity;
    }
    this.x[i] = x; this.y[i] = y; this.z[i] = z; this.vx[i] = vx; this.vy[i] = vy; this.vz[i] = vz;
    this.sx[i] = sx; this.sy[i] = sy; this.sz[i] = sz; this.floorY[i] = floorY;
    this.r[i] = r; this.g[i] = g; this.b[i] = b; this.rx[i] = rx; this.ry[i] = ry;
    this.spinX[i] = spinX; this.spinY[i] = spinY; this.age[i] = 0; this.bounces[i] = 0; this.kind[i] = kind;
    this.spawned++;
  }

  /** Integrate. `onLand` fires on the first floor contact of a chunk (index, so the caller can leave a stain). */
  update(dt: number, onLand?: (i: number) => void): void {
    for (let i = this.count - 1; i >= 0; i--) {
      this.age[i] += dt;
      if (this.age[i] >= CHUNK_LIFE) {
        this.removeAt(i);
        continue;
      }
      if (this.bounces[i] >= 3 || (this.bounces[i] > 0 && Math.abs(this.vy[i]) < 0.4 && this.y[i] <= this.floorY[i] + 0.001)) {
        // at rest on the floor
        this.vx[i] = 0; this.vy[i] = 0; this.vz[i] = 0; this.spinX[i] = 0; this.spinY[i] = 0;
        this.y[i] = this.floorY[i];
        continue;
      }
      this.vy[i] -= GRAVITY * dt;
      this.x[i] += this.vx[i] * dt;
      this.y[i] += this.vy[i] * dt;
      this.z[i] += this.vz[i] * dt;
      this.rx[i] += this.spinX[i] * dt;
      this.ry[i] += this.spinY[i] * dt;
      if (this.y[i] <= this.floorY[i] && this.vy[i] < 0) {
        this.y[i] = this.floorY[i];
        this.vy[i] *= -0.34;
        this.vx[i] *= 0.62;
        this.vz[i] *= 0.5;
        this.spinX[i] *= 0.5;
        this.spinY[i] *= 0.5;
        if (this.bounces[i]++ === 0 && onLand) onLand(i);
      }
    }
  }

  private removeAt(i: number): void {
    const l = --this.count;
    if (i === l) return;
    const arrs = [
      this.x, this.y, this.z, this.vx, this.vy, this.vz, this.rx, this.ry, this.sx, this.sy, this.sz,
      this.spinX, this.spinY, this.floorY, this.r, this.g, this.b, this.age,
    ];
    for (const a of arrs) a[i] = a[l];
    this.bounces[i] = this.bounces[l];
    this.kind[i] = this.kind[l];
  }

  /** Scale envelope: pops in, shrinks away over the last second. */
  scaleOf(i: number): number {
    const left = CHUNK_LIFE - this.age[i];
    return left < 1 ? Math.max(0, left) : 1;
  }

  clear(): void {
    this.count = 0;
    this.cursor = 0;
  }
}

/** Z of the back wall decals and of the lane the chunks fly in. */
export const GORE_WALL_Z = -3.08;

/** Owns both pools, the recipes and a private RNG (not the simulation's). */
export class GoreSim {
  level: GoreLevel = 'full';
  readonly chunks = new ChunkPool(CHUNK_CAPACITY);
  readonly decals = new DecalPool(DECAL_CAPACITY);
  private seed = 0x1badf00d;

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

  private count(n: number): number {
    const s = goreScale(this.level);
    return s <= 0 ? 0 : Math.max(1, Math.round(n * s));
  }

  /** Lethal hit: a shower of chunks plus wall and floor stains. `floorY` is the enemy's feet. */
  spawnKill(kind: GoreKind, x: number, cy: number, floorY: number, dir: number): void {
    if (this.level === 'off') return;
    const rc = GORE_RECIPES[kind];
    const n = this.count(rc.chunks);
    for (let i = 0; i < n; i++) this.chunk(rc, x, cy, floorY, dir, 1);
    const nd = this.count(rc.decals);
    for (let i = 0; i < nd; i++) {
      // roughly half the stains go on the back wall around the body, the rest pool on the floor
      if (i % 2 === 0) {
        this.decals.add(x + this.rr(-1.4, 1.4) + dir * 0.6, cy + this.rr(-0.9, 1.0), GORE_WALL_Z, rc.decalSize * this.rr(0.6, 1.3), this.rr(0, 6.28), false, rc.splat[0], rc.splat[1], rc.splat[2]);
      } else {
        this.decals.add(x + this.rr(-1.6, 1.6) + dir * 0.8, floorY + 0.035, this.rr(-0.7, 0.7), rc.decalSize * this.rr(0.7, 1.4), this.rr(-0.4, 0.4), true, rc.splat[0], rc.splat[1], rc.splat[2]);
      }
    }
  }

  /** Non-lethal hit: a few small flecks and the occasional wall spot. */
  spawnHit(kind: GoreKind, x: number, cy: number, floorY: number, dir: number): void {
    if (this.level === 'off') return;
    const rc = GORE_RECIPES[kind];
    const n = this.count(rc.hitChunks);
    for (let i = 0; i < n; i++) this.chunk(rc, x, cy, floorY, dir, 0.45);
    if (this.level === 'full' && this.rnd() < 0.5) {
      this.decals.add(x + dir * this.rr(0.4, 1.2), cy + this.rr(-0.5, 0.6), GORE_WALL_Z, rc.decalSize * this.rr(0.25, 0.5), this.rr(0, 6.28), false, rc.splat[0], rc.splat[1], rc.splat[2]);
    }
  }

  private chunk(rc: GoreRecipe, x: number, cy: number, floorY: number, dir: number, scale: number): void {
    const a = this.rr(0.2, Math.PI - 0.2);
    const sp = this.rr(rc.speed * 0.35, rc.speed);
    const c = rc.palette[Math.floor(this.rnd() * rc.palette.length)];
    const s = this.rr(rc.sizeLo, rc.sizeHi) * scale;
    this.chunks.add(
      x + this.rr(-0.25, 0.25), cy + this.rr(-0.4, 0.4), this.rr(-0.35, 0.35),
      Math.cos(a) * sp + dir * rc.speed * 0.25, Math.sin(a) * sp * 0.9 + 3, this.rr(-1.2, 1.2),
      s * this.rr(0.8, 1.5), s * this.rr(0.6, 1.1), s * this.rr(0.7, 1.3),
      floorY + s * 0.3, c[0], c[1], c[2],
      this.rr(0, 6.28), this.rr(0, 6.28), this.rr(-14, 14), this.rr(-14, 14), 0,
    );
  }

  update(dt: number): void {
    if (this.chunks.count > 0) {
      this.chunks.update(dt, (i) => {
        // the first landing leaves a small stain, tinted like the chunk (low level skips it)
        if (this.level !== 'full') return;
        const k = this.chunks;
        this.decals.add(k.x[i], k.floorY[i] + 0.03, k.z[i], 0.5 + k.sx[i] * 2, this.rr(-0.5, 0.5), true, k.r[i] * 0.7, k.g[i] * 0.7, k.b[i] * 0.7, 14);
      });
    }
    if (this.decals.count > 0) this.decals.update(dt);
  }

  clear(): void {
    this.chunks.clear();
    this.decals.clear();
  }
}
