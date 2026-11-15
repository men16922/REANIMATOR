// R13: Core Warden silhouette helpers. Two unlit additive sprites, no lights:
// a cool back halo behind the body (separates the dark armour from the orange arena) and a
// gold-white weak-point flare on the chest core that shows only while the weak point is exposed.

import * as THREE from 'three';
import { WARDEN_HALO_RGB, WARDEN_WEAK_RGB, type WardenLook } from './wardenLook3d.ts';

function softTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.45, 'rgba(255,255,255,0.45)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

/** Chest core height as a fraction of body height (matches the shader core centre). */
const CORE_Y_FRAC = 0.63;

export class WardenHalo3D {
  readonly group = new THREE.Group();
  private readonly halo: THREE.Sprite;
  private readonly weak: THREE.Sprite;

  constructor() {
    this.group.name = 'warden-look';
    const tex = softTexture();
    this.halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.halo.material.color.setRGB(WARDEN_HALO_RGB[0], WARDEN_HALO_RGB[1], WARDEN_HALO_RGB[2]);
    this.halo.name = 'warden-halo';
    this.halo.renderOrder = -1;
    this.weak = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex, transparent: true, opacity: 0, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
    }));
    this.weak.material.color.setRGB(WARDEN_WEAK_RGB[0], WARDEN_WEAK_RGB[1], WARDEN_WEAK_RGB[2]);
    this.weak.name = 'warden-weakpoint';
    this.weak.renderOrder = 8;
    this.group.add(this.halo, this.weak);
    this.group.visible = false;
  }

  /** x, y: Warden feet position; h: body height. Pass null to hide. */
  update(look: WardenLook | null, x: number, y: number, h: number): void {
    if (!look || (look.halo <= 0.001 && look.weak <= 0.001)) {
      this.group.visible = false;
      return;
    }
    this.group.visible = true;
    this.halo.visible = look.halo > 0.001;
    this.halo.position.set(x, y + h * 0.55, -1.4);
    this.halo.scale.set(h * 1.55, h * 1.75, 1);
    this.halo.material.opacity = 0.42 * look.halo;
    this.weak.visible = look.weak > 0.001;
    this.weak.position.set(x, y + h * CORE_Y_FRAC, 0.9);
    const s = h * (0.42 + 0.18 * look.weak);
    this.weak.scale.set(s, s, 1);
    this.weak.material.opacity = Math.min(1, 0.9 * look.weak);
  }
}
