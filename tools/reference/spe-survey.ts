// Abuse SPE level survey. `node tools/reference/spe-survey.ts [abuseDir]`
// Reads LEVELS/LEVEL00..04.SPE from the private original install (read-only) and writes ONLY derived
// stats (counts, sizes, coordinates, names) to docs/evidence/abuse_levels/survey.json. No original bytes are emitted.
//
// Method tags in the output: "binary parse" = decoded from SPE bytes with the layout verified here
// (directory arithmetic, section size == header + n*elem); "unverified" = layout guessed, meaning not confirmed.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const abuse = resolve(process.argv[2] ?? `${root}/reference/private/abuse-box/ABUSE`);
const outDir = `${root}/docs/evidence/abuse_levels`;

interface Section { name: string; type: number; offset: number; size: number }

function directory(b: Buffer): Section[] {
  // Bytes after the last section (if any) are reported as trailingBytes; their meaning is unverified.
  if (b.toString('latin1', 0, 7) !== 'SPEC1.0') throw new Error('not an SPE file');
  const n = b.readUInt16LE(8);
  let p = 10;
  const out: Section[] = [];
  for (let i = 0; i < n; i++) {
    const type = b[p];
    const len = b[p + 1];
    const name = b.toString('latin1', p + 2, p + 1 + len); // len includes the trailing NUL
    p += 2 + len + 1; // 1 flag byte after the name
    const size = b.readUInt32LE(p);
    const offset = b.readUInt32LE(p + 4);
    p += 8;
    out.push({ name, type, offset, size });
  }
  // Consistency: sections are contiguous after the directory.
  let pos = out[0].offset;
  for (const s of out) {
    if (s.offset !== pos) throw new Error(`section ${s.name} not contiguous`);
    pos += s.size;
  }
  if (pos > b.length) throw new Error(`sections end at ${pos} but file is ${b.length}`);
  return out;
}

const sec = (b: Buffer, d: Section[], name: string) => {
  const s = d.find((x) => x.name === name);
  if (!s) throw new Error(`missing section ${name}`);
  return b.subarray(s.offset, s.offset + s.size);
};

function names(buf: Buffer): string[] {
  const out: string[] = [];
  for (let p = 0; p < buf.length; ) {
    const l = buf[p];
    out.push(buf.toString('latin1', p + 1, p + l));
    p += 1 + l;
  }
  return out;
}

function mapOf(buf: Buffer) {
  const w = buf.readUInt32LE(0), h = buf.readUInt32LE(4);
  if (buf.length !== 8 + w * h * 2) throw new Error('map size mismatch');
  const tiles = new Uint16Array(w * h);
  for (let i = 0; i < w * h; i++) tiles[i] = buf.readUInt16LE(8 + i * 2);
  return { w, h, tiles };
}

const CATEGORY: Record<string, string[]> = {
  enemy: ['ANT_ROOF', 'HIDDEN_ANT', 'ANT_CRACK', 'TRACK_GUN', 'SPRAY_GUN', 'JUGGER', 'ROB1', 'WHO', 'WALK_ROB', 'FLYER', 'GREEN_FLYER', 'BOSS_ANT', 'ANT', 'DARNEL'],
  pickup: ['HEALTH', 'POWER_FAST', 'POWER_FLY', 'POWER_SNEAKY', 'POWER_HEALTH'],
  door: ['SWITCH_DOOR', 'FORCE_FIELD', 'TP_DOOR', 'TRAP_DOOR2', 'TRAP_DOOR3'],
  switch: ['SWITCH', 'SWITCH_ONCE', 'SWITCH_DELAY', 'SWITCH_MOVER', 'SENSOR', 'SENSOR_LINKER', 'SWITCH_BALL', 'SWITCH_DIMMER', 'DEATH_SENSOR'],
  gate: ['GATE_DELAY', 'GATE_OR', 'GATE_AND', 'GATE_NOT', 'GATE_XOR', 'GATE_PULSE', 'INDICATOR'],
  level_exit: ['NEXT_LEVEL', 'NEXT_LEVEL_TOP'],
  checkpoint: ['RESTART_POSITION'],
  hazard: ['LAVA', 'LIGHTIN', 'BOMB', 'BIG_BOMB', 'BOLDER', 'SMALL_BOLDER', 'CONC', 'CONC_AIR'],
  mover: ['LADDER', 'STEP', 'PUSHER', 'SPRING', 'OBJ_MOVER', 'TELE2'],
};

const levels: Record<string, unknown>[] = [];
for (let k = 0; k <= 4; k++) {
  const file = `LEVEL0${k}.SPE`;
  const b = readFileSync(`${abuse}/LEVELS/${file}`);
  const d = directory(b);
  const nameTable = names(sec(b, d, 'describe_names'));
  const nTypes = sec(b, d, 'object_descripitions').readUInt16LE(0);
  if (nTypes !== nameTable.length) throw new Error('describe_names count mismatch');

  const fg = mapOf(sec(b, d, 'fgmap'));
  const bg = mapOf(sec(b, d, 'bgmap'));
  const nObj = sec(b, d, 'object_list').readUInt32LE(0);

  const typeBuf = sec(b, d, 'type');
  const xBuf = sec(b, d, 'x'), yBuf = sec(b, d, 'y');
  const asBuf = sec(b, d, 'aistate');
  if (typeBuf.length !== 1 + 2 * nObj || xBuf.length !== 1 + 4 * nObj || yBuf.length !== 1 + 4 * nObj || asBuf.length !== 1 + 2 * nObj) {
    throw new Error('per-object array length mismatch');
  }

  const counts: Record<string, number> = {};
  const key: Record<string, { x: number; y: number; aistate: number }[]> = {};
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < nObj; i++) {
    const t = nameTable[typeBuf.readUInt16LE(1 + i * 2)] ?? `?${typeBuf.readUInt16LE(1 + i * 2)}`;
    const x = xBuf.readInt32LE(1 + i * 4), y = yBuf.readInt32LE(1 + i * 4), as = asBuf.readUInt16LE(1 + i * 2);
    counts[t] = (counts[t] ?? 0) + 1;
    if (['START', 'NEXT_LEVEL', 'NEXT_LEVEL_TOP', 'RESTART_POSITION', 'END_OF_S'].includes(t)) (key[t] ??= []).push({ x, y, aistate: as });
    minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  const byCategory: Record<string, number> = {};
  for (const [cat, list] of Object.entries(CATEGORY)) byCategory[cat] = list.reduce((s, n) => s + (counts[n] ?? 0), 0);
  const categorised = new Set(Object.values(CATEGORY).flat());
  // Name-pattern groups (heuristic by Lisp def_char / icon naming; categorisation itself is inference).
  byCategory.weapon_pickup = Object.entries(counts).filter(([n]) => /_ICON\d+$/.test(n)).reduce((s, [, c]) => s + c, 0);
  byCategory.hidden_wall = Object.entries(counts).filter(([n]) => /^HIDDEN_WALL/.test(n)).reduce((s, [, c]) => s + c, 0);
  byCategory.other = Object.entries(counts).filter(([n]) => !categorised.has(n) && !/_ICON\d+$/.test(n) && !/^HIDDEN_WALL/.test(n)).reduce((s, [, c]) => s + c, 0);

  const area = sec(b, d, 'area_list.v1'); // ver byte + u32 count + 44-byte records (x,y,w,h seen as i32; rest unverified)
  const nArea = area.readUInt32LE(1);
  if (area.length !== 5 + nArea * 44) throw new Error('area_list size mismatch');
  const lights = sec(b, d, 'lights');
  const nLights = lights.readUInt32LE(0);
  const objLinks = sec(b, d, 'object_links');
  const nObjLinks = objLinks.readUInt32LE(1);
  const lightLinks = sec(b, d, 'light_links');
  const nLightLinks = lightLinks.readUInt32LE(1);
  if (objLinks.length !== 5 + nObjLinks * 8 || lightLinks.length !== 5 + nLightLinks * 8) throw new Error('link size mismatch');

  const solid = fg.tiles.reduce((s, t) => s + (t & 0x8000 ? 1 : 0), 0);
  const nonZero = fg.tiles.reduce((s, t) => s + (t ? 1 : 0), 0);
  const distinctFg = new Set(fg.tiles).size;
  const distinctBg = new Set(bg.tiles).size;
  const levelExits = (key.NEXT_LEVEL ?? []).map((e) => ({ ...e, targetLevel: e.aistate }));

  levels.push({
    file,
    method: 'binary parse',
    bytes: b.length,
    cpfBytes: readFileSync(`${abuse}/LEVELS/LEVEL0${k}.CPF`).length,
    sections: d.length,
    trailingBytes: b.length - (d[d.length - 1].offset + d[d.length - 1].size),
    extraSections: d.map((s) => s.name).filter((n) => n === 'first name'),
    sectionSizes: Object.fromEntries(d.filter((s) => ['fgmap', 'bgmap', 'object_list', 'lights', 'object_links', 'area_list.v1'].includes(s.name)).map((s) => [s.name, s.size])),
    fgmap: { width: fg.w, height: fg.h, tiles: fg.w * fg.h, nonZeroTiles: nonZero, highBitTiles: solid, distinctTileValues: distinctFg, note: 'high-bit (0x8000) meaning unverified' },
    bgmap: { width: bg.w, height: bg.h, distinctTileValues: distinctBg },
    objectCount: nObj,
    objectTypesDistinct: Object.keys(counts).length,
    objectBounds: { minX, maxX, minY, maxY, unit: 'pixels (assumed; unverified)' },
    objectCountsByName: Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1])),
    objectCountsByCategory: byCategory,
    keyObjects: key,
    levelExits,
    levelExitMethod: 'binary parse (NEXT_LEVEL aistate) + Lisp reading (PEOPLE.LSP next_level_ai: "levels/level"+digstr(aistate,2)+".spe"; aistate==end_level(5) -> request_end_game)',
    areas: nArea,
    lights: nLights,
    objectLinks: nObjLinks,
    lightLinks: nLightLinks,
    unverified: ['area_list record field meanings beyond count', 'lights record layout (25 B each assumed)', 'tile high-bit meaning', 'object coordinate units'],
  });
}

const totals = {
  levels: levels.length,
  objects: levels.reduce((s, l) => s + (l.objectCount as number), 0),
};
mkdirSync(outDir, { recursive: true });
writeFileSync(`${outDir}/survey.json`, JSON.stringify({
  schema: 'reanimator-abuse-level-survey-v1',
  source: 'Abuse shareware 1.05 LEVELS/LEVEL00..04.SPE (private, not committed)',
  note: 'Derived statistics only. No original bytes.',
  totals,
  levels,
}, null, 2) + '\n');
for (const l of levels as { file: string; fgmap: { width: number; height: number }; objectCount: number }[]) {
  console.log(l.file, `${l.fgmap.width}x${l.fgmap.height}`, `objects=${l.objectCount}`);
}
console.log('wrote', `${outDir}/survey.json`);
