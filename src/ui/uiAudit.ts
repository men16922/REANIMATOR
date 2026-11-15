// Browser-only UI audit behind window.__reanimatorUiAudit(). Opens every panel through the real buttons and
// checks that each control is actually on top at its own center (document.elementFromPoint), opaque, and that the
// title logo/menu step aside when a panel is open. The pure rules live in panels.ts; this file only measures.

export interface UiAuditFailure {
  id: string;
  reason: 'covered' | 'transparent' | 'offscreen' | 'zero-size' | 'wrong-top-layer' | 'title-chrome-visible';
  detail: string;
}

export interface UiAuditScenario {
  name: string;
  expectedTop: string;
  /** Number of controls measured. */
  checked: number;
  topLayer: string;
  failures: UiAuditFailure[];
}

export interface UiAuditReport {
  ok: boolean;
  scenarios: UiAuditScenario[];
}

export interface UiAuditDriver {
  toTitle(): void;
  toPaused(): void;
  toResult(): void;
  /** Wait for N animation frames. */
  frames(n: number): Promise<void>;
}

interface Step {
  name: string;
  expectedTop: string;
  /** Button ids to click in order, after the mode driver ran. */
  clicks: string[];
  mode: 'title' | 'paused' | 'result';
}

const STEPS: readonly Step[] = [
  { name: 'title', expectedTop: 'title', clicks: [], mode: 'title' },
  { name: 'settings', expectedTop: 'settings-panel', clicks: ['settings-open'], mode: 'title' },
  { name: 'extras', expectedTop: 'extras-panel', clicks: ['extras-open'], mode: 'title' },
  { name: 'demo', expectedTop: 'demo-panel', clicks: ['extras-open', 'demo-open'], mode: 'title' },
  { name: 'controls', expectedTop: 'title-controls', clicks: ['extras-open', 'title-controls-open'], mode: 'title' },
  { name: 'revived', expectedTop: 'revived', clicks: ['extras-open', 'revived-open'], mode: 'title' },
  { name: 'lab', expectedTop: 'lab', clicks: ['extras-open', 'lab-open'], mode: 'title' },
  { name: 'credits', expectedTop: 'title-credits', clicks: ['extras-open', 'credits-open'], mode: 'title' },
  { name: 'pause', expectedTop: 'pause', clicks: [], mode: 'paused' },
  { name: 'pause-controls', expectedTop: 'controls-panel', clicks: ['controls-open'], mode: 'paused' },
  { name: 'result', expectedTop: 'result', clicks: [], mode: 'result' },
];

const CONTROL_SELECTOR = 'button, input, select, [role="menuitem"]';

function effectiveOpacity(el: Element): number {
  let o = 1;
  for (let n: Element | null = el; n; n = n.parentElement) o *= Number(getComputedStyle(n).opacity);
  return o;
}

function isRendered(el: Element): boolean {
  return el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
}

function measure(el: HTMLElement, failures: UiAuditFailure[]): void {
  const id = el.id || el.tagName.toLowerCase();
  el.scrollIntoView({ block: 'nearest' });
  const r = el.getBoundingClientRect();
  if (r.width < 1 || r.height < 1) {
    failures.push({ id, reason: 'zero-size', detail: `${r.width}x${r.height}` });
    return;
  }
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  if (cx < 0 || cy < 0 || cx > window.innerWidth || cy > window.innerHeight) {
    failures.push({ id, reason: 'offscreen', detail: `${Math.round(cx)},${Math.round(cy)}` });
    return;
  }
  const o = effectiveOpacity(el);
  if (o < 0.5) failures.push({ id, reason: 'transparent', detail: `opacity ${o.toFixed(2)}` });
  const top = document.elementFromPoint(cx, cy);
  const ok = !!top && (top === el || el.contains(top) || !!top.closest('label')?.contains(el));
  if (!ok) {
    const t = top as HTMLElement | null;
    failures.push({ id, reason: 'covered', detail: t ? `${t.tagName.toLowerCase()}#${t.id}.${String(t.className)}` : 'nothing' });
  }
}

export async function runUiAudit(d: UiAuditDriver): Promise<UiAuditReport> {
  const scenarios: UiAuditScenario[] = [];
  const stage = document.getElementById('stage') as HTMLElement;
  for (const step of STEPS) {
    d.toTitle();
    if (step.mode === 'paused') d.toPaused();
    if (step.mode === 'result') d.toResult();
    await d.frames(2);
    for (const id of step.clicks) {
      document.getElementById(id)?.click();
      await d.frames(2);
    }
    await d.frames(3);
    const failures: UiAuditFailure[] = [];
    const topLayer = stage.dataset.topLayer ?? '';
    if (topLayer !== step.expectedTop) failures.push({ id: step.expectedTop, reason: 'wrong-top-layer', detail: `top is "${topLayer}"` });
    const container = document.getElementById(step.expectedTop);
    const controls = container ? [...container.querySelectorAll<HTMLElement>(CONTROL_SELECTOR)].filter(isRendered) : [];
    // The title scenario measures only the first-screen menu; sub panels inside #title are display:none then.
    for (const el of controls) measure(el, failures);
    if (step.expectedTop !== 'title') {
      for (const id of ['title-logo', 'title-menu']) {
        const el = document.getElementById(id);
        if (el && isRendered(el)) failures.push({ id, reason: 'title-chrome-visible', detail: `visible under ${step.expectedTop}` });
      }
    }
    scenarios.push({ name: step.name, expectedTop: step.expectedTop, checked: controls.length, topLayer, failures });
  }
  d.toTitle();
  await d.frames(2);
  return { ok: scenarios.every((s) => s.failures.length === 0 && s.checked > 0), scenarios };
}
