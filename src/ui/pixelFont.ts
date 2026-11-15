// Original 5x7 bitmap font for the Classic View HUD and transition label. Every glyph below was drawn for this project;
// no font or sprite data from Abuse (or any other game) is used.

export const GLYPH_W = 5;
export const GLYPH_H = 7;
export const GLYPH_ADVANCE = 6;

/** Seven rows per glyph, '#' = lit pixel. */
const SRC: Record<string, string> = {
  '0': '.###./#...#/#..##/#.#.#/##..#/#...#/.###.',
  '1': '..#../.##../..#../..#../..#../..#../.###.',
  '2': '.###./#...#/....#/...#./..#../.#.../#####',
  '3': '.###./#...#/....#/..##./....#/#...#/.###.',
  '4': '...#./..##./.#.#./#..#./#####/...#./...#.',
  '5': '#####/#..../####./....#/....#/#...#/.###.',
  '6': '..##./.#.../#..../####./#...#/#...#/.###.',
  '7': '#####/....#/...#./..#../.#.../.#.../.#...',
  '8': '.###./#...#/#...#/.###./#...#/#...#/.###.',
  '9': '.###./#...#/#...#/.####/....#/...#./.##..',
  A: '.###./#...#/#...#/#####/#...#/#...#/#...#',
  B: '####./#...#/#...#/####./#...#/#...#/####.',
  C: '.###./#...#/#..../#..../#..../#...#/.###.',
  D: '####./#...#/#...#/#...#/#...#/#...#/####.',
  E: '#####/#..../#..../####./#..../#..../#####',
  F: '#####/#..../#..../####./#..../#..../#....',
  G: '.###./#...#/#..../#.###/#...#/#...#/.####',
  H: '#...#/#...#/#...#/#####/#...#/#...#/#...#',
  I: '.###./..#../..#../..#../..#../..#../.###.',
  J: '..###/...#./...#./...#./...#./#..#./.##..',
  K: '#...#/#..#./#.#../##.../#.#../#..#./#...#',
  L: '#..../#..../#..../#..../#..../#..../#####',
  M: '#...#/##.##/#.#.#/#.#.#/#...#/#...#/#...#',
  N: '#...#/##..#/#.#.#/#..##/#...#/#...#/#...#',
  O: '.###./#...#/#...#/#...#/#...#/#...#/.###.',
  P: '####./#...#/#...#/####./#..../#..../#....',
  Q: '.###./#...#/#...#/#...#/#.#.#/#..#./.##.#',
  R: '####./#...#/#...#/####./#.#../#..#./#...#',
  S: '.####/#..../#..../.###./....#/....#/####.',
  T: '#####/..#../..#../..#../..#../..#../..#..',
  U: '#...#/#...#/#...#/#...#/#...#/#...#/.###.',
  V: '#...#/#...#/#...#/#...#/#...#/.#.#./..#..',
  W: '#...#/#...#/#...#/#.#.#/#.#.#/##.##/#...#',
  X: '#...#/#...#/.#.#./..#../.#.#./#...#/#...#',
  Y: '#...#/#...#/.#.#./..#../..#../..#../..#..',
  Z: '#####/....#/...#./..#../.#.../#..../#####',
  ' ': '...../...../...../...../...../...../.....',
  ':': '...../..#../..#../...../..#../..#../.....',
  '/': '....#/....#/...#./..#../.#.../#..../#....',
  '%': '##..#/##..#/...#./..#../.#.../#..##/#..##',
  '-': '...../...../...../#####/...../...../.....',
  '.': '...../...../...../...../...../.##../.##..',
  '+': '...../..#../..#../#####/..#../..#../.....',
  '!': '..#../..#../..#../..#../..#../...../..#..',
  '?': '.###./#...#/....#/...#./..#../...../..#..',
  x: '...../...../#...#/.#.#./..#../.#.#./#...#',
  '[': '.###./.#.../.#.../.#.../.#.../.#.../.###.',
  ']': '.###./...#./...#./...#./...#./...#./.###.',
};

export const GLYPH_CHARS: string = Object.keys(SRC).join('');

const GLYPHS = new Map<string, string[]>();
for (const [ch, s] of Object.entries(SRC)) GLYPHS.set(ch, s.split('/'));

/** Rows of a glyph (unknown characters render as '?'; lower-case maps to upper-case, except 'x'). */
export function glyphRows(ch: string): string[] {
  const direct = GLYPHS.get(ch);
  if (direct) return direct;
  const up = GLYPHS.get(ch.toUpperCase());
  return up ?? (GLYPHS.get('?') as string[]);
}

export function textWidth(text: string): number {
  return text.length === 0 ? 0 : text.length * GLYPH_ADVANCE - (GLYPH_ADVANCE - GLYPH_W);
}

/** Lit pixel coordinates of a text run, origin top-left. */
export function textPixels(text: string): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let i = 0; i < text.length; i++) {
    const rows = glyphRows(text[i]);
    for (let y = 0; y < GLYPH_H; y++) for (let x = 0; x < GLYPH_W; x++) if (rows[y][x] === '#') out.push([i * GLYPH_ADVANCE + x, y]);
  }
  return out;
}

/** Draws text into a 2D context using fillRect per lit pixel. `scale` multiplies every pixel. */
export function drawPixelText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, scale = 1): void {
  ctx.fillStyle = color;
  for (const [px, py] of textPixels(text)) ctx.fillRect(x + px * scale, y + py * scale, scale, scale);
}
