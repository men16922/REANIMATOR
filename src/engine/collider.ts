// Tile collider for the new game map. NEW-DESIGN: the original tile intersection (0x558e5) was located
// but not reconstructed; this approximates it with a feet-point body of half-width HW and height H.
import type { Collider } from './motion.ts';

export const TILE = 16;

export interface TileMap {
  w: number;
  h: number;
  solid(tx: number, ty: number): boolean;
}

export function tileCollider(map: TileMap, hw = 6, height = 28): Collider {
  const solidAt = (px: number, py: number) => {
    const tx = Math.floor(px / TILE);
    const ty = Math.floor(py / TILE);
    if (tx < 0 || ty < 0 || tx >= map.w || ty >= map.h) return true;
    return map.solid(tx, ty);
  };
  // any solid tile in the body's vertical span at column px
  const columnBlocked = (px: number, feetY: number) => {
    // sample every 8 px (smaller than a tile) plus the exact top and bottom rows
    for (let py = feetY - height; py < feetY - 1; py += 8) if (solidAt(px, py)) return true;
    return solidAt(px, feetY - 1);
  };
  const rowBlocked = (x: number, py: number) => solidAt(x - hw, py) || solidAt(x + hw - 1, py);

  return {
    clipX(x, y, wantX) {
      const s = Math.sign(wantX - x);
      let cx = x;
      while (cx !== wantX) {
        const next = cx + s;
        const edge = s > 0 ? next + hw - 1 : next - hw;
        if (columnBlocked(edge, y)) break;
        cx = next;
      }
      return cx;
    },
    clipY(x, y, wantY) {
      const s = Math.sign(wantY - y);
      if (s > 0 && rowBlocked(x, y)) return { y, floor: true }; // already standing on a tile top
      let cy = y;
      while (cy !== wantY) {
        const next = cy + s;
        // feet y convention: the first solid row under the body (same as a spawn on a tile top)
        if (s > 0 && rowBlocked(x, next)) return { y: next, floor: true };
        if (s < 0 && rowBlocked(x, next - height)) return { y: cy, floor: false };
        cy = next;
      }
      return { y: cy, floor: false };
    },
    grounded(x, y) {
      return rowBlocked(x, y);
    },
  };
}

export function parseMap(rows: readonly string[]): TileMap & { find(ch: string): { tx: number; ty: number }[] } {
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const at = (tx: number, ty: number) => rows[ty]?.[tx] ?? ' ';
  return {
    w, h,
    solid: (tx, ty) => at(tx, ty) === '#',
    find(ch) {
      const out: { tx: number; ty: number }[] = [];
      rows.forEach((r, ty) => [...r].forEach((c, tx) => c === ch && out.push({ tx, ty })));
      return out;
    },
  };
}
