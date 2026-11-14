// Release guard: dist/ must not contain any original Abuse file (by sha256 or by name) or binary payloads.
// Usage: node tools/release/check-dist.ts   (exit 0 = clean)
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, join, basename } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const dist = join(root, 'dist');
const manifest = JSON.parse(readFileSync(join(root, 'reference/manifests/abuse-source.json'), 'utf8')) as {
  allFiles: { path: string; sha256: string }[];
};
const originalHashes = new Set(manifest.allFiles.map((f) => f.sha256));
const originalNames = new Set(manifest.allFiles.map((f) => basename(f.path).toLowerCase()));
const allowedExt = new Set(['.html', '.js', '.css', '.svg', '.ico', '.json', '.txt', '.glb', '.png', '.webp']);

if (!existsSync(dist)) { console.log(JSON.stringify({ status: 'NOT RUN', reason: 'dist missing' })); process.exit(2); }

const files: string[] = [];
const walk = (d: string) => readdirSync(d).forEach((n) => { const p = join(d, n); statSync(p).isDirectory() ? walk(p) : files.push(p); });
walk(dist);

const problems: string[] = [];
for (const f of files) {
  const buf = readFileSync(f);
  const rel = f.slice(dist.length + 1);
  if (originalHashes.has(createHash('sha256').update(buf).digest('hex'))) problems.push(`${rel}: identical to an original file`);
  if (originalNames.has(basename(f).toLowerCase())) problems.push(`${rel}: original file name`);
  const ext = f.slice(f.lastIndexOf('.')).toLowerCase();
  if (!allowedExt.has(ext)) problems.push(`${rel}: unexpected file type`);
  if (buf.subarray(0, 2).toString('latin1') === 'MZ') problems.push(`${rel}: DOS/PE executable header`);
  // the extender's embedded copyright banner (binary signature), not prose that merely names DOS/4GW
  if (buf.includes(Buffer.from('Rational Systems, Inc.'))) problems.push(`${rel}: contains DOS/4G extender banner`);
}
const bytes = files.reduce((s, f) => s + statSync(f).size, 0);
console.log(JSON.stringify({ status: problems.length ? 'FAIL' : 'PASS', files: files.length, bytes, checkedAgainst: originalHashes.size, problems }));
process.exit(problems.length ? 1 : 0);
