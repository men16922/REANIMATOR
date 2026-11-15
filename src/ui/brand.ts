// REANIMATOR brand kit: an original SVG wordmark and reactor-heart emblem, drawn from scratch.
// No fonts, no raster images, no original Abuse data. The stencil-metal look is a stylistic nod only.

export const BRAND = {
  name: 'REANIMATOR',
  tagline: 'The reactor still burns. Reach the core. Get out.',
  pitch: 'A 3D side-view sci-fi metroidvania',
  credit: 'WEBGL2 · KEYBOARD + MOUSE',
} as const;

interface Glyph {
  ch: string;
  w: number;
  /** Outer path (and optional counter) in a 84-unit tall cell, filled with evenodd. */
  d: string;
}

/** Blocky chamfered stencil letters, 84 units tall. */
export const GLYPHS: readonly Glyph[] = [
  { ch: 'R', w: 60, d: 'M0 0H44L60 14V34L48 44L62 84H44L32 48H16V84H0ZM16 14H40V34H16Z' },
  { ch: 'E', w: 60, d: 'M0 0H60V14H16V34H50V48H16V70H60V84H0Z' },
  { ch: 'A', w: 62, d: 'M0 84L18 0H44L62 84H46L43 66H19L16 84ZM22 52H40L31 16Z' },
  { ch: 'N', w: 60, d: 'M0 0H18L44 52V0H60V84H42L16 32V84H0Z' },
  { ch: 'I', w: 16, d: 'M0 0H16V84H0Z' },
  { ch: 'M', w: 72, d: 'M0 0H18L36 36L54 0H72V84H56V32L36 66L16 32V84H0Z' },
  { ch: 'A', w: 62, d: 'M0 84L18 0H44L62 84H46L43 66H19L16 84ZM22 52H40L31 16Z' },
  { ch: 'T', w: 60, d: 'M0 0H60V14H38V84H22V14H0Z' },
  { ch: 'O', w: 60, d: 'M10 0H50L60 10V74L50 84H10L0 74V10ZM16 14H44V70H16Z' },
  { ch: 'R', w: 60, d: 'M0 0H44L60 14V34L48 44L62 84H44L32 48H16V84H0ZM16 14H40V34H16Z' },
];

export const LOGO_GAP = 12;
export const LOGO_VIEW = { w: 820, h: 300 } as const;

/** Total wordmark width in SVG units. */
export function wordmarkWidth(): number {
  return GLYPHS.reduce((s, g) => s + g.w, 0) + LOGO_GAP * (GLYPHS.length - 1);
}

/** Left x of every glyph, centered in the view box. */
export function glyphOffsets(): number[] {
  let x = (LOGO_VIEW.w - wordmarkWidth()) / 2;
  return GLYPHS.map((g) => {
    const at = x;
    x += g.w + LOGO_GAP;
    return at;
  });
}

const WM_Y = 150;

function layer(cls: string, fill: string, dy = 0, extra = ''): string {
  const xs = glyphOffsets();
  const body = GLYPHS.map(
    // The placement lives on a wrapper <g>: a CSS transform on .lt (assemble animation) replaces a transform
    // attribute on the same element, which dropped every glyph at the SVG origin (top-left artifact, no wordmark).
    (g, i) => `<g transform="translate(${xs[i]} ${WM_Y + dy})"><path class="lt" style="--i:${i}" fill-rule="evenodd" d="${g.d}"/></g>`,
  ).join('');
  return `<g class="${cls}" fill="${fill}"${extra}>${body}</g>`;
}

/** Hexagonal reactor ring with a heart core, centered above the wordmark. */
function emblem(): string {
  const cx = LOGO_VIEW.w / 2;
  const cy = 66;
  const hex = (r: number) =>
    Array.from({ length: 6 }, (_, k) => {
      const a = (Math.PI / 3) * k + Math.PI / 6;
      return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`;
    }).join(' ');
  const ticks = Array.from({ length: 12 }, (_, k) => {
    const a = (Math.PI / 6) * k;
    const x1 = cx + 60 * Math.cos(a);
    const y1 = cy + 60 * Math.sin(a);
    const x2 = cx + 66 * Math.cos(a);
    const y2 = cy + 66 * Math.sin(a);
    return `M${x1.toFixed(1)} ${y1.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}`;
  }).join('');
  const heart = `M${cx} ${cy + 34}C${cx - 40} ${cy + 6} ${cx - 52} ${cy - 12} ${cx - 52} ${cy - 24}C${cx - 52} ${cy - 42} ${cx - 22} ${cy - 48} ${cx} ${cy - 24}C${cx + 22} ${cy - 48} ${cx + 52} ${cy - 42} ${cx + 52} ${cy - 24}C${cx + 52} ${cy - 12} ${cx + 40} ${cy + 6} ${cx} ${cy + 34}Z`;
  const rails = `M40 ${cy}H${cx - 84}L${cx - 70} ${cy - 8}M${LOGO_VIEW.w - 40} ${cy}H${cx + 84}L${cx + 70} ${cy - 8}M60 ${cy + 10}H${cx - 100}M${LOGO_VIEW.w - 60} ${cy + 10}H${cx + 100}`;
  const ecg = `M${cx - 40} ${cy - 2}H${cx - 18}L${cx - 10} ${cy - 22}L${cx} ${cy + 20}L${cx + 9} ${cy - 8}H${cx + 40}`;
  return `<g class="emblem">
    <path class="rails" d="${rails}" fill="none" stroke="url(#rust)" stroke-width="2"/>
    <polygon class="ring-out" points="${hex(80)}" fill="none" stroke="url(#steel)" stroke-width="5" stroke-linejoin="round"/>
    <polygon class="ring-in" points="${hex(70)}" fill="rgba(4,8,12,.82)" stroke="#2a323c" stroke-width="2"/>
    <path class="ticks" d="${ticks}" stroke="#ff9a3c" stroke-width="2" fill="none"/>
    <path class="heart-glow" d="${heart}" fill="#ff5a1f" filter="url(#soft)"/>
    <path class="heart" d="${heart}" fill="url(#heart)" stroke="#ffd6a0" stroke-width="1.5"/>
    <path class="ecg-core" d="${ecg}" fill="none" stroke="#0a1118" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>
    <path class="ecg-core-lit" d="${ecg}" fill="none" stroke="#7dffb0" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/>
  </g>`;
}

/** Complete inline logo. Decorative; the page keeps a real heading for assistive tech. */
export function buildLogoSvg(uid = 'a'): string {
  const { w, h } = LOGO_VIEW;
  const svg = `<svg class="logo-svg" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${BRAND.name}">
  <defs>
    <linearGradient id="steel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f4f1ea"/><stop offset=".45" stop-color="#9aa4ae"/><stop offset=".55" stop-color="#5d6772"/><stop offset="1" stop-color="#cfc7b8"/></linearGradient>
    <linearGradient id="rust" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ff7a1a" stop-opacity="0"/><stop offset=".5" stop-color="#ff8a2a"/><stop offset="1" stop-color="#ff7a1a" stop-opacity="0"/></linearGradient>
    <linearGradient id="heart" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff9a3c"/><stop offset=".6" stop-color="#d63a12"/><stop offset="1" stop-color="#7a1608"/></linearGradient>
    <pattern id="scanp" width="4" height="4" patternUnits="userSpaceOnUse"><rect width="4" height="1.4" fill="#000" opacity=".34"/></pattern>
    <filter id="soft" x="-20%" y="-40%" width="140%" height="180%"><feGaussianBlur stdDeviation="9"/></filter>
  </defs>
  ${emblem()}
  <g class="wordmark">
    ${layer('wm-glow', '#ff6a1f', 0, ' filter="url(#soft)"')}
    ${layer('wm-depth', '#2a0f08', 7)}
    ${layer('wm-face', 'url(#steel)', 0)}
    ${layer('wm-scan', 'url(#scanp)', 0)}
  </g>
  <path class="underline" d="M${(w - wordmarkWidth()) / 2} 262H${(w + wordmarkWidth()) / 2}" stroke="url(#rust)" stroke-width="3"/>
</svg>`;
  // Unique paint-server ids per instance: a display:none copy must not shadow a visible one.
  return svg.replace(/(id="|url\(#)(steel|rust|heart|scanp|soft)/g, `$1$2-${uid}`);
}

/** Favicon: reactor hex with a heart. Mirrors the inline data URI in index.html. */
export const FAVICON_SVG =
  "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><polygon points='32,3 58,18 58,46 32,61 6,46 6,18' fill='#0a0f16' stroke='#9aa4ae' stroke-width='4'/><path d='M32 47C16 36 14 27 14 24C14 16 25 14 32 24C39 14 50 16 50 24C50 27 48 36 32 47Z' fill='#e8501a'/></svg>";
