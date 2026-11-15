// Classic View render path: scene -> low-res target (320x200) -> palette + Bayer dither pass -> nearest integer upscale
// with an optional CRT look, plus the 0.4 s mosaic transition overlay. Palette and dither maths live in classicLogic.ts.

import * as THREE from 'three';
import { drawPixelText, textWidth } from '../ui/pixelFont.ts';
import {
  buildPalette,
  computeClassicLayout,
  DITHER_SPREAD,
  PALETTE_SIZE,
  crtFrame,
  transitionLabel,
  type ClassicLayout,
  type ViewMode,
} from './classicLogic.ts';

export * from './classicLogic.ts';

const VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const QUANT_FRAG = /* glsl */ `
uniform sampler2D tScene;
uniform sampler2D tPalette;
uniform float uExposure, uSpread, uHurt;
uniform vec3 uFlash;
varying vec2 vUv;
const float BAYER[16] = float[16](0.,8.,2.,10.,12.,4.,14.,6.,3.,11.,1.,9.,15.,7.,13.,5.);
vec3 aces(vec3 x) {
  x *= uExposure;
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}
void main() {
  vec3 c = aces(texture2D(tScene, vUv).rgb);
  c.gb *= 1.0 - 0.55 * uHurt;
  c += uFlash;
  c = pow(clamp(c, 0.0, 1.0), vec3(1.0 / 2.2));
  int ix = int(mod(gl_FragCoord.x, 4.0));
  int iy = int(mod(gl_FragCoord.y, 4.0));
  c += ((BAYER[iy * 4 + ix] + 0.5) / 16.0 - 0.5) * uSpread;
  c = clamp(c, 0.0, 1.0);
  float best = 1e9;
  vec3 pick = vec3(0.0);
  for (int i = 0; i < ${PALETTE_SIZE}; i++) {
    vec3 p = texelFetch(tPalette, ivec2(i, 0), 0).rgb;
    vec3 d = p - c;
    float dist = d.r * d.r * 0.3 + d.g * d.g * 0.59 + d.b * d.b * 0.11;
    if (dist < best) { best = dist; pick = p; }
  }
  gl_FragColor = vec4(pick, 1.0);
}
`;

const BLIT_FRAG = /* glsl */ `
uniform sampler2D tPixels;
uniform vec2 uOffset;   // lower-left corner of the picture in drawing-buffer pixels
uniform vec2 uView;     // scaled picture size in drawing-buffer pixels
uniform vec2 uSize;     // internal resolution
uniform float uCrt;
varying vec2 vUv;
void main() {
  vec2 uv = (gl_FragCoord.xy - uOffset) / uView;
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
  if (uCrt > 0.5) {
    vec2 c = uv * 2.0 - 1.0;
    c *= 1.0 + 0.045 * dot(c, c);
    uv = c * 0.5 + 0.5;
    if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
    float row = fract(uv.y * uSize.y);
    float scan = 0.74 + 0.26 * smoothstep(0.0, 0.45, row) * (1.0 - smoothstep(0.55, 1.0, row));
    int m = int(mod(gl_FragCoord.x, 3.0));
    vec3 tri = vec3(m == 0 ? 1.0 : 0.8, m == 1 ? 1.0 : 0.8, m == 2 ? 1.0 : 0.8);
    float vig = 1.0 - 0.17 * dot(c, c);
    gl_FragColor = vec4(texture2D(tPixels, uv).rgb * tri * scan * vig * 1.14, 1.0);
    return;
  }
  gl_FragColor = vec4(texture2D(tPixels, uv).rgb, 1.0);
}
`;

export interface ClassicFrameParams {
  flash: readonly [number, number, number];
  /** 0..1 low-HP red tint. */
  hurt: number;
  crt: boolean;
}

/** Owns the low-res targets and the two full-screen passes. Targets are reused and only rebuilt when the buffer size changes. */
export class ClassicPipeline {
  private layout: ClassicLayout;
  private bufW = 0;
  private bufH = 0;
  private rtScene: THREE.WebGLRenderTarget;
  private rtPixels: THREE.WebGLRenderTarget;
  private readonly paletteTex: THREE.DataTexture;
  private readonly quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
  private readonly quadScene = new THREE.Scene();
  private readonly quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly quantMat: THREE.ShaderMaterial;
  private readonly blitMat: THREE.ShaderMaterial;

  constructor(private readonly renderer: THREE.WebGLRenderer) {
    const size = new THREE.Vector2();
    renderer.getDrawingBufferSize(size);
    this.layout = computeClassicLayout(size.x, size.y);
    this.bufW = size.x;
    this.bufH = size.y;
    this.rtScene = new THREE.WebGLRenderTarget(this.layout.w, this.layout.h, {
      type: THREE.HalfFloatType,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: true,
    });
    this.rtPixels = new THREE.WebGLRenderTarget(this.layout.w, this.layout.h, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: false,
    });
    const pal = buildPalette();
    const rgba = new Uint8Array(PALETTE_SIZE * 4);
    for (let i = 0; i < PALETTE_SIZE; i++) {
      rgba[i * 4] = pal[i * 3];
      rgba[i * 4 + 1] = pal[i * 3 + 1];
      rgba[i * 4 + 2] = pal[i * 3 + 2];
      rgba[i * 4 + 3] = 255;
    }
    this.paletteTex = new THREE.DataTexture(rgba, PALETTE_SIZE, 1, THREE.RGBAFormat);
    this.paletteTex.minFilter = THREE.NearestFilter;
    this.paletteTex.magFilter = THREE.NearestFilter;
    this.paletteTex.needsUpdate = true;
    this.quantMat = new THREE.ShaderMaterial({
      uniforms: {
        tScene: { value: this.rtScene.texture },
        tPalette: { value: this.paletteTex },
        uExposure: { value: 1.0 },
        uSpread: { value: DITHER_SPREAD },
        uHurt: { value: 0 },
        uFlash: { value: new THREE.Vector3() },
      },
      vertexShader: VERT,
      fragmentShader: QUANT_FRAG,
      depthTest: false,
      depthWrite: false,
    });
    this.blitMat = new THREE.ShaderMaterial({
      uniforms: {
        tPixels: { value: this.rtPixels.texture },
        uOffset: { value: new THREE.Vector2() },
        uView: { value: new THREE.Vector2(1, 1) },
        uSize: { value: new THREE.Vector2(this.layout.w, this.layout.h) },
        uCrt: { value: 0 },
      },
      vertexShader: VERT,
      fragmentShader: BLIT_FRAG,
      depthTest: false,
      depthWrite: false,
    });
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);
  }

  get currentLayout(): ClassicLayout {
    return this.layout;
  }

  get bufferSize(): { w: number; h: number } {
    return { w: this.bufW, h: this.bufH };
  }

  /** Rebuilds targets only when the drawing buffer size changed (resize or devicePixelRatio change). */
  private ensureSize(): void {
    const size = new THREE.Vector2();
    this.renderer.getDrawingBufferSize(size);
    if (size.x === this.bufW && size.y === this.bufH) return;
    this.bufW = size.x;
    this.bufH = size.y;
    this.layout = computeClassicLayout(size.x, size.y);
    this.rtScene.setSize(this.layout.w, this.layout.h);
    this.rtPixels.setSize(this.layout.w, this.layout.h);
    (this.blitMat.uniforms.uSize.value as THREE.Vector2).set(this.layout.w, this.layout.h);
  }

  /** Call before reading `currentLayout` for the frame (camera aspect, aim remap). */
  public refresh(): ClassicLayout {
    this.ensureSize();
    return this.layout;
  }

  public render(scene: THREE.Scene, camera: THREE.Camera, p: ClassicFrameParams): void {
    const r = this.renderer;
    this.ensureSize();
    const l = this.layout;
    r.setRenderTarget(this.rtScene);
    r.clear();
    r.render(scene, camera);

    const qu = this.quantMat.uniforms;
    qu.uHurt.value = p.hurt;
    (qu.uFlash.value as THREE.Vector3).set(p.flash[0], p.flash[1], p.flash[2]);
    this.quad.material = this.quantMat;
    r.setRenderTarget(this.rtPixels);
    r.render(this.quadScene, this.quadCam);

    const bu = this.blitMat.uniforms;
    (bu.uOffset.value as THREE.Vector2).set(l.offX, this.bufH - l.viewH - l.offY);
    (bu.uView.value as THREE.Vector2).set(l.viewW, l.viewH);
    bu.uCrt.value = p.crt ? 1 : 0;
    this.quad.material = this.blitMat;
    r.setRenderTarget(null);
    r.render(this.quadScene, this.quadCam);
  }

  public dispose(): void {
    this.rtScene.dispose();
    this.rtPixels.dispose();
    this.paletteTex.dispose();
    this.quantMat.dispose();
    this.blitMat.dispose();
    this.quad.geometry.dispose();
  }
}

/** 2D overlay that collapses the live canvas like a CRT powering off and on over 0.4 s around a view switch and shows the "1996"/"2026" label. */
export class PixelTransition {
  private readonly overlay: HTMLCanvasElement;
  private readonly octx: CanvasRenderingContext2D | null;
  private startMs = -1;
  private target: ViewMode = 'classic';
  private fired = false;
  private onSwitch: (() => void) | null = null;

  constructor(private readonly source: HTMLCanvasElement) {
    this.overlay = document.createElement('canvas');
    this.overlay.id = 'view-fx';
    this.overlay.width = 640;
    this.overlay.height = 400;
    this.overlay.hidden = true;
    this.overlay.setAttribute('aria-hidden', 'true');
    this.octx = this.overlay.getContext('2d');
    // Directly after the game canvas: HUD, title and result layers stay above the mosaic.
    source.after(this.overlay);
  }

  get active(): boolean {
    return this.startMs >= 0;
  }

  /** Begins the transition. `onSwitch` runs once at the mosaic peak (t = 0.5). */
  public start(target: ViewMode, onSwitch: () => void, nowMs: number): void {
    this.target = target;
    this.onSwitch = onSwitch;
    this.fired = false;
    this.startMs = nowMs;
  }

  /** Ends any running transition immediately. */
  public finish(): void {
    this.startMs = -1;
    this.overlay.hidden = true;
    this.onSwitch = null;
  }

  /** Call right after the scene render of every frame (the WebGL buffer is still readable in that task). */
  public afterRender(nowMs: number): void {
    if (this.startMs < 0 || !this.octx) return;
    const f = crtFrame((nowMs - this.startMs) / 1000);
    if (f.switched && !this.fired) {
      this.fired = true;
      this.onSwitch?.();
    }
    if (f.done) {
      this.startMs = -1;
      this.overlay.hidden = true;
      this.onSwitch = null;
      return;
    }
    // CRT power-off/on: the picture squashes toward one scanline, whole-pixel steps, flat black and a hard white line.
    const W = this.overlay.width;
    const H = this.overlay.height;
    const hh = Math.max(2, Math.round(f.heightFrac * 200) * (H / 200));
    const y0 = Math.round((H - hh) / 2);
    this.octx.globalAlpha = 1;
    this.octx.imageSmoothingEnabled = false;
    this.octx.fillStyle = '#000';
    this.octx.fillRect(0, 0, W, H);
    this.octx.drawImage(this.source, 0, 0, this.source.width, this.source.height, 0, y0, W, hh);
    if (f.glow > 0.35) {
      this.octx.fillStyle = f.glow > 0.9 ? '#f0f0e0' : '#a0a090';
      this.octx.fillRect(0, Math.round(H / 2) - 2, W, 4);
    }
    const label = transitionLabel(this.target);
    const sc = 10;
    const lw = textWidth(label) * sc;
    if (f.glow > 0.8) {
      this.octx.fillStyle = '#000';
      this.octx.fillRect(0, H / 2 - 5 * sc, W, 10 * sc);
      drawPixelText(this.octx, label, Math.round((W - lw) / 2), Math.round(H / 2 - (7 * sc) / 2), this.target === 'classic' ? '#e0a040' : '#80f0ff', sc);
    }
    this.overlay.hidden = false;
  }
}
