// Applies required combat/locomotion preset clips to rigged Meshy characters via Chrome CDP bridge,
// polls for signed CDN animation GLB URLs, downloads Character_output.glb + all Animation_*_withSkin.glb
// into assets/meshy-raw/rigged/<char>/, verifies GLB headers, and shuts down the Meshy daemon.
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const BASE_URL = 'http://127.0.0.1:49222';
const RAW_RIGGED_DIR = resolve(process.cwd(), 'assets/meshy-raw/rigged');
const MIN_CREDITS = 415;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface ActionRecord {
  actionType?: string;
  clipSlug?: string;
  armatureGlbUrl?: string;
  animationGlbUrl?: string;
}

interface ClipSpec {
  role: string;
  candidates: Array<{ name: string; animationId: number; free: boolean }>;
}

interface CharacterSpec {
  id: 'operative' | 'warden' | 'bio-stalker';
  taskId: string;
  clips: ClipSpec[];
}

const CHARACTERS: CharacterSpec[] = [
  {
    id: 'operative',
    taskId: '01a1d9fb-4f86-743a-9ad7-f28febe2aef7',
    clips: [
      {
        role: 'idle',
        candidates: [
          { name: '전투 아이들', animationId: 89, free: false },
          { name: '경계', animationId: 2, free: true },
        ],
      },
      {
        role: 'jump',
        candidates: [
          { name: '정규 점프', animationId: 466, free: false },
          { name: '달리고 뛰어라', animationId: 463, free: false },
        ],
      },
      {
        role: 'shoot',
        candidates: [
          { name: '달리며 사격', animationId: 98, free: false },
          { name: '공격', animationId: 4, free: true },
        ],
      },
      {
        role: 'death',
        candidates: [{ name: '사망', animationId: 8, free: true }],
      },
    ],
  },
  {
    id: 'warden',
    taskId: '01a1d9fb-72e9-705f-b61d-3040157b9bd5',
    clips: [
      {
        role: 'idle',
        candidates: [{ name: '경계', animationId: 2, free: true }],
      },
      {
        role: 'attack',
        candidates: [
          { name: '무거운 망치 휘두르기', animationId: 128, free: false },
          { name: '충전된 그라운드 슬램', animationId: 127, free: false },
          { name: '삼중 콤보 공격', animationId: 105, free: true },
        ],
      },
      {
        role: 'death',
        candidates: [{ name: '사망', animationId: 8, free: true }],
      },
    ],
  },
  {
    id: 'bio-stalker',
    taskId: '01a1d9fc-b613-70d2-9b75-84dad49c4089',
    clips: [
      {
        role: 'idle',
        candidates: [{ name: '경계', animationId: 2, free: true }],
      },
      {
        role: 'run_fast',
        candidates: [{ name: '빠르게 달리기', animationId: 16, free: true }],
      },
      {
        role: 'attack',
        candidates: [
          { name: '삼중 콤보 공격', animationId: 105, free: true },
          { name: '공격', animationId: 4, free: true },
        ],
      },
      {
        role: 'death',
        candidates: [{ name: '사망', animationId: 8, free: true }],
      },
    ],
  },
];

async function getStatus(): Promise<{ connected: boolean; credits: number }> {
  const res = await fetch(`${BASE_URL}/status`);
  return (await res.json()) as { connected: boolean; credits: number };
}

async function evalBrowser<T>(expr: string): Promise<T> {
  const res = await fetch(`${BASE_URL}/eval`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ expr }),
  });
  const json = (await res.json()) as { ok?: boolean; result?: T; error?: string };
  if (!json.ok) throw new Error(json.error ?? JSON.stringify(json));
  return json.result as T;
}

async function getActionsForTask(taskId: string): Promise<ActionRecord[]> {
  return evalBrowser<ActionRecord[]>(`
    const cards = [...document.querySelectorAll('[data-testid="assets-card"]')];
    if (!cards.length) return [];
    const fk = Object.keys(cards[0]).find(k => k.startsWith('__reactFiber'));
    let cur = cards[0][fk];
    while (cur && !cur.memoizedProps?.tasks) cur = cur.return;
    const t = (cur?.memoizedProps?.tasks || []).find(x => x.taskId === ${JSON.stringify(taskId)});
    return t?.animateResult?.actions || [];
  `);
}

async function selectAnimateTask(taskId: string): Promise<void> {
  await evalBrowser(`
    document.querySelector('[data-testid="workspace-sidebar-animate-btn"]')?.click();
    return true;
  `);
  await sleep(400);
  const idx = await evalBrowser<number>(`
    const cards = [...document.querySelectorAll('[data-testid="assets-card"]')];
    const fk = Object.keys(cards[0]).find(k => k.startsWith('__reactFiber'));
    let cur = cards[0][fk];
    while (cur && !cur.memoizedProps?.tasks) cur = cur.return;
    const tasks = cur?.memoizedProps?.tasks || [];
    const idx = tasks.findIndex(t => t.taskId === ${JSON.stringify(taskId)});
    if (idx < 0) throw new Error('Task not found in asset grid: ' + ${JSON.stringify(taskId)});
    cards[idx].querySelector('[data-testid="assets-card-select"]').click();
    return idx;
  `);
  await sleep(1100);
  console.log(`  Selected task ${taskId} (card index ${idx})`);
}

async function switchToLibraryTab(): Promise<void> {
  await evalBrowser(`
    const tab = [...document.querySelectorAll('*')].find(el => el.childElementCount <= 2 && el.textContent?.trim() === '도서관');
    if (tab) tab.click();
    return !!tab;
  `);
  await sleep(350);
}

async function addPresetByName(taskId: string, candidate: { name: string; animationId: number }): Promise<boolean> {
  const before = await getActionsForTask(taskId);
  const beforeCount = before.length;

  await evalBrowser(`
    const inp = [...document.querySelectorAll('input')].find(i => !i.closest('[data-testid]') && i.getBoundingClientRect().x < 400);
    if (!inp) throw new Error('Preset search input not found');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(inp, ${JSON.stringify(candidate.name)});
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  `);
  await sleep(500);

  const hoverState = await evalBrowser<{ found: boolean; animId?: number }>(`
    const cards = [...document.querySelectorAll('[class*=action-card]')];
    let target = null;
    for (const c of cards) {
      const fk = Object.keys(c).find(k => k.startsWith('__reactFiber$'));
      let cur = fk ? c[fk] : null;
      while (cur && !('animationId' in (cur.memoizedProps || {}))) cur = cur.return;
      if (cur && cur.memoizedProps.animationId === ${candidate.animationId}) {
        target = c;
        break;
      }
    }
    if (!target) {
      target = cards.find(c => c.innerText?.trim() === ${JSON.stringify(candidate.name)});
    }
    if (!target) return { found: false };
    // Clear any prior hover
    for (const c of cards) {
      if (c !== target) {
        const pk = Object.keys(c).find(k => k.startsWith('__reactProps$'));
        c[pk]?.onMouseLeave?.();
      }
    }
    const pk = Object.keys(target).find(k => k.startsWith('__reactProps$'));
    target[pk]?.onMouseEnter?.();
    return { found: true, animId: ${candidate.animationId} };
  `);
  if (!hoverState.found) {
    console.log(`    Card not found for "${candidate.name}" (id ${candidate.animationId})`);
    return false;
  }
  await sleep(250);

  const clickRes = await evalBrowser<{ state: string }>(`
    const cards = [...document.querySelectorAll('[class*=action-card]')];
    let target = null;
    for (const c of cards) {
      const fk = Object.keys(c).find(k => k.startsWith('__reactFiber$'));
      let cur = fk ? c[fk] : null;
      while (cur && !('animationId' in (cur.memoizedProps || {}))) cur = cur.return;
      if (cur && cur.memoizedProps.animationId === ${candidate.animationId}) {
        target = c;
        break;
      }
    }
    if (!target) return { state: 'missing' };
    const fk = Object.keys(target).find(k => k.startsWith('__reactFiber$'));
    let cur = target[fk];
    while (cur && !('added' in (cur.memoizedProps || {}))) cur = cur.return;
    if (cur?.memoizedProps?.added) return { state: 'already-added' };
    const btn = target.querySelector('button');
    if (!btn) return { state: 'no-button' };
    const label = btn.innerText.trim();
    if (label.includes('제거')) return { state: 'already-added' };
    btn.click();
    return { state: 'clicked:' + label };
  `);

  console.log(`    "${candidate.name}" (id=${candidate.animationId}) -> ${clickRes.state}`);
  if (clickRes.state === 'already-added') return true;
  if (!clickRes.state.startsWith('clicked:')) return false;

  // Poll until actions length increases and new action has URL, or timeout/error
  for (let i = 0; i < 16; i++) {
    await sleep(1200);
    const actions = await getActionsForTask(taskId);
    if (actions.length > beforeCount) {
      const newest = actions[actions.length - 1];
      if (newest.animationGlbUrl) {
        console.log(`    Added OK -> actionType=${newest.actionType}, clipSlug=${newest.clipSlug}`);
        return true;
      }
    }
  }
  return false;
}

async function downloadGlb(url: string, outPath: string): Promise<number> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} downloading ${outPath}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.subarray(0, 4).toString('utf8') !== 'glTF') {
    throw new Error(`Invalid GLB header in ${outPath}`);
  }
  await writeFile(outPath, buf);
  return buf.byteLength;
}

async function main(): Promise<void> {
  const st0 = await getStatus();
  if (!st0.connected) throw new Error('Meshy daemon not connected');
  console.log(`Connected to Meshy. Credits: ${st0.credits}`);
  if (st0.credits < MIN_CREDITS) throw new Error(`Credits below floor: ${st0.credits} < ${MIN_CREDITS}`);

  await mkdir(RAW_RIGGED_DIR, { recursive: true });
  const manifest: Record<string, { taskId: string; armature: string; clips: Array<{ actionType: string; clipSlug: string; file: string; bytes: number }> }> = {};

  for (const char of CHARACTERS) {
    console.log(`\n=== Processing ${char.id} (${char.taskId}) ===`);
    await selectAnimateTask(char.taskId);
    await switchToLibraryTab();

    for (const clip of char.clips) {
      const currentActions = await getActionsForTask(char.taskId);
      const alreadyMatch = currentActions.find((a) =>
        clip.candidates.some((c) => {
          const slug = (a.clipSlug || '').toLowerCase();
          const typ = (a.actionType || '').toLowerCase();
          if (c.animationId === 4 && (slug === 'attack' || typ === 'attack')) return true;
          if (c.animationId === 8 && (slug === 'dead' || typ === 'dead' || slug.includes('dead') || slug.includes('dying'))) return true;
          if (c.animationId === 16 && slug.includes('runfast')) return true;
          if (c.animationId === 2 && slug.includes('alert')) return true;
          if (c.animationId === 105 && slug.includes('triple')) return true;
          if (c.animationId === 89 && slug.includes('combat')) return true;
          if (c.animationId === 98 && (slug.includes('run') && slug.includes('shoot'))) return true;
          if (c.animationId === 466 && slug.includes('jump')) return true;
          if (c.animationId === 463 && slug.includes('jump')) return true;
          if (c.animationId === 128 && slug.includes('hammer')) return true;
          if (c.animationId === 127 && slug.includes('slam')) return true;
          return false;
        }),
      );
      if (alreadyMatch && alreadyMatch.animationGlbUrl) {
        console.log(`  Role "${clip.role}" already present: ${alreadyMatch.clipSlug} / ${alreadyMatch.actionType}`);
        continue;
      }

      let satisfied = false;
      for (const cand of clip.candidates) {
        const st = await getStatus();
        if (!cand.free && st.credits < MIN_CREDITS) {
          console.log(`  Skipping paid clip "${cand.name}" (credits ${st.credits} < ${MIN_CREDITS})`);
          continue;
        }
        const ok = await addPresetByName(char.taskId, cand);
        if (ok) {
          satisfied = true;
          break;
        }
      }
      if (!satisfied) {
        console.warn(`  WARNING: could not satisfy role "${clip.role}" for ${char.id}`);
      }
    }

    // Clear preset search before moving on
    await evalBrowser(`
      const reset = [...document.querySelectorAll('button')].find(b => b.innerText.trim() === '초기화');
      if (reset) reset.click();
      return true;
    `);
    await sleep(300);

    // Download armature + all animation GLBs for this character
    const finalActions = await getActionsForTask(char.taskId);
    if (!finalActions.length) throw new Error(`No actions found for ${char.id}`);
    const charDir = resolve(RAW_RIGGED_DIR, char.id);
    await mkdir(charDir, { recursive: true });

    const armUrl = finalActions.find((a) => a.armatureGlbUrl)?.armatureGlbUrl;
    if (!armUrl) throw new Error(`Missing armatureGlbUrl for ${char.id}`);
    const armBytes = await downloadGlb(armUrl, resolve(charDir, 'Character_output.glb'));
    console.log(`  Downloaded ${char.id}/Character_output.glb (${(armBytes / 1024 / 1024).toFixed(2)} MB)`);

    const downloadedClips: Array<{ actionType: string; clipSlug: string; file: string; bytes: number }> = [];
    for (const act of finalActions) {
      if (!act.animationGlbUrl) continue;
      const slug = (act.clipSlug || act.actionType || 'clip').replace(/[^a-zA-Z0-9_-]+/g, '_');
      const file = `Animation_${slug}_withSkin.glb`;
      const bytes = await downloadGlb(act.animationGlbUrl, resolve(charDir, file));
      console.log(`  Downloaded ${char.id}/${file} (${(bytes / 1024 / 1024).toFixed(2)} MB)`);
      downloadedClips.push({
        actionType: act.actionType || slug,
        clipSlug: act.clipSlug || slug,
        file: `${char.id}/${file}`,
        bytes,
      });
    }
    manifest[char.id] = {
      taskId: char.taskId,
      armature: `${char.id}/Character_output.glb`,
      clips: downloadedClips,
    };
  }

  await writeFile(resolve(RAW_RIGGED_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  const stEnd = await getStatus();
  console.log(`\nAll rigged GLBs downloaded cleanly! Ending credits: ${stEnd.credits}`);

  // Clean shutdown of Meshy CDP daemon now that all assets are exported
  await fetch(`${BASE_URL}/shutdown`, { method: 'POST' });
  console.log('Meshy daemon shut down.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
