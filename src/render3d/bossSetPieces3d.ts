// R10: pooled arena set piece meshes (floor fissures and vent glows). One merged mesh + 3 sprites, all unlit additive, no lights.
// Reads the world only. Visible while the Warden fight is on.

import * as THREE from 'three';
import type { EnemyState3D } from '../game3d/world3d.ts';
import { BOSS_FLOOR_X0, BOSS_FLOOR_X1 } from './bossTelegraph3d.ts';
import { VENT_XS, arenaSetPiece, crackPath, type ArenaSetPiece } from './setpieces3d.ts';

export const CRACK_COUNT = 8;

function glowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export class BossSetPieces3D {
  readonly group = new THREE.Group();
  private readonly cracks: THREE.Mesh;
  private readonly vents: THREE.Sprite[] = [];
  private phase = 1;
  private since = 0;
  /** Latest eased values, read by the scene (tint) and FX (steam, debris). */
  state: ArenaSetPiece = { crack: 0, steam: 0, tint: 0, debris: 0 };

  constructor() {
    this.group.name = 'boss-setpieces';
    const pos: number[] = [];
    const idx: number[] = [];
    for (let i = 0; i < CRACK_COUNT; i++) {
      const path = crackPath(i, BOSS_FLOOR_X0 + 1, BOSS_FLOOR_X1 - 1);
      const w0 = 0.07;
      for (let s = 0; s < path.length; s++) {
        const base = pos.length / 3;
        const taper = w0 * (1 - s / path.length);
        pos.push(path[s].x - taper, path[s].y, 0.62, path[s].x + taper, path[s].y, 0.62);
        if (s > 0) idx.push(base - 2, base - 1, base + 1, base - 2, base + 1, base);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    this.cracks = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      color: 0xff7a2a, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    }));
    this.cracks.frustumCulled = false;
    this.cracks.renderOrder = 5;
    this.group.add(this.cracks);

    const tex = glowTexture();
    for (const x of VENT_XS) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0xffb070, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
      s.position.set(x, 0.15, 0.7);
      s.renderOrder = 6;
      this.group.add(s);
      this.vents.push(s);
    }
    this.group.visible = false;
  }

  update(wd: EnemyState3D | null, dt: number, tSec: number, reduce: boolean): ArenaSetPiece {
    const on = !!wd && wd.active && wd.alive;
    const ph = on ? wd!.phase : 1;
    if (ph !== this.phase) {
      this.phase = ph;
      this.since = 0;
    } else {
      this.since += dt;
    }
    this.state = arenaSetPiece(ph, this.since, on);
    const s = this.state;
    this.group.visible = s.crack > 0.001;
    if (!this.group.visible) return s;
    const pulse = reduce ? 0.8 : 0.7 + 0.3 * Math.sin(tSec * 3.1);
    (this.cracks.material as THREE.MeshBasicMaterial).opacity = s.crack * (0.45 + 0.4 * s.tint) * pulse;
    for (let i = 0; i < this.vents.length; i++) {
      const v = this.vents[i];
      const k = s.steam * (reduce ? 0.6 : 0.65 + 0.35 * Math.sin(tSec * 2.3 + i * 2));
      v.scale.set(1.6 + k, 0.8 + k * 1.4, 1);
      (v.material as THREE.SpriteMaterial).opacity = 0.28 * k;
    }
    return s;
  }
}
