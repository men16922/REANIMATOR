// Native WebSocket CDP helper restricted strictly to the Meshy workspace tab in Chrome.
// Reads ~/Library/Application Support/Google/Chrome/DevToolsActivePort directly to avoid
// Playwright's connectOverCDP timeout across multiple Chrome profiles.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';

export interface CdpTargetInfo {
  targetId: string;
  type: string;
  title: string;
  url: string;
  browserContextId?: string;
}

export class MeshyCdp {
  private ws: WebSocket;
  private nextId = 1;
  private pending = new Map<number, { res: (v: unknown) => void; rej: (e: Error) => void }>();
  private eventListeners = new Set<(method: string, params: Record<string, unknown>) => void>();
  public sessionId = '';
  public target!: CdpTargetInfo;

  private constructor(ws: WebSocket) {
    this.ws = ws;
    ws.onmessage = (ev) => {
      const msg = JSON.parse(String(ev.data)) as {
        id?: number;
        method?: string;
        params?: Record<string, unknown>;
        result?: unknown;
        error?: { message?: string; code?: number };
      };
      if (msg.id && this.pending.has(msg.id)) {
        const entry = this.pending.get(msg.id)!;
        this.pending.delete(msg.id);
        if (msg.error) entry.rej(new Error(`CDP ${msg.error.code}: ${msg.error.message}`));
        else entry.res(msg.result);
      } else if (msg.method) {
        for (const fn of this.eventListeners) fn(msg.method, msg.params ?? {});
      }
    };
  }

  static async connect(): Promise<MeshyCdp> {
    const portFile = join(homedir(), 'Library/Application Support/Google/Chrome/DevToolsActivePort');
    const [port, wsPath] = readFileSync(portFile, 'utf8').trim().split('\n');
    const ws = new WebSocket(`ws://127.0.0.1:${port}${wsPath}`);
    await new Promise<void>((res, rej) => {
      const t = setTimeout(() => rej(new Error('CDP WebSocket open timeout')), 60_000);
      ws.onopen = () => { clearTimeout(t); res(); };
      ws.onerror = (e) => { clearTimeout(t); rej(new Error(`CDP WebSocket error: ${String(e)}`)); };
    });
    const client = new MeshyCdp(ws);
    const { targetInfos } = await client.call<{ targetInfos: CdpTargetInfo[] }>('Target.getTargets');
    const meshy = targetInfos.find((t) => t.type === 'page' && /meshy\.ai/i.test(t.url));
    if (!meshy) {
      ws.close();
      throw new Error('No meshy.ai page target found in Chrome');
    }
    client.target = meshy;
    const { sessionId } = await client.call<{ sessionId: string }>('Target.attachToTarget', {
      targetId: meshy.targetId,
      flatten: true,
    });
    client.sessionId = sessionId;
    await client.call('Page.enable', {}, sessionId);
    await client.call('Runtime.enable', {}, sessionId);
    await client.call('DOM.enable', {}, sessionId);
    return client;
  }

  async call<T = unknown>(method: string, params: Record<string, unknown> = {}, sessionId?: string): Promise<T> {
    const id = this.nextId++;
    return new Promise<T>((res, rej) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        rej(new Error(`CDP timeout on ${method}`));
      }, 20000);
      this.pending.set(id, {
        res: (v) => { clearTimeout(timer); res(v as T); },
        rej: (e) => { clearTimeout(timer); rej(e); },
      });
      this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }

  onEvent(fn: (method: string, params: Record<string, unknown>) => void): () => void {
    this.eventListeners.add(fn);
    return () => this.eventListeners.delete(fn);
  }

  async evalJson<T = unknown>(expression: string): Promise<T> {
    const out = await this.call<{
      result?: { value?: unknown; description?: string };
      exceptionDetails?: { text?: string; exception?: { description?: string } };
    }>('Runtime.evaluate', {
      expression: `JSON.stringify((() => { ${expression} })())`,
      returnByValue: true,
      awaitPromise: true,
    }, this.sessionId);
    if (out.exceptionDetails) {
      throw new Error(`Eval error: ${out.exceptionDetails.exception?.description ?? out.exceptionDetails.text}`);
    }
    const raw = out.result?.value;
    if (typeof raw !== 'string') return raw as T;
    return JSON.parse(raw) as T;
  }

  async screenshot(outPath: string): Promise<void> {
    mkdirSync(dirname(outPath), { recursive: true });
    const { data } = await this.call<{ data: string }>('Page.captureScreenshot', { format: 'png' }, this.sessionId);
    writeFileSync(outPath, Buffer.from(data, 'base64'));
  }

  async setDownloadDir(absDir: string): Promise<void> {
    mkdirSync(absDir, { recursive: true });
    await this.call('Browser.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath: absDir,
      ...(this.target.browserContextId ? { browserContextId: this.target.browserContextId } : {}),
      eventsEnabled: true,
    });
  }

  async getCredits(): Promise<number> {
    const credits = await this.evalJson<number | null>(`
      const btn = [...document.querySelectorAll('button')].find(b => /\\d+/.test(b.innerText) && b.innerText.trim().length <= 6 && !/1\\/4|20/.test(b.innerText));
      if (!btn) return null;
      const m = btn.innerText.replace(/,/g, '').match(/\\d+/);
      return m ? Number(m[0]) : null;
    `);
    if (credits === null || Number.isNaN(credits)) {
      throw new Error('Could not read Meshy credit balance');
    }
    if (credits < 400) {
      throw new Error(`Credit safety cap reached (${credits} < 400). Aborting further generations.`);
    }
    return credits;
  }

  async clickText(text: string, role?: string): Promise<boolean> {
    return this.evalJson<boolean>(`
      const want = ${JSON.stringify(text)};
      const role = ${JSON.stringify(role ?? null)};
      const els = [...document.querySelectorAll('button, [role="button"], [role="radio"], [role="tab"], a')];
      const match = els.find(el => {
        if (role && el.getAttribute('role') !== role) return false;
        const t = (el.innerText || el.getAttribute('aria-label') || '').trim().replace(/\\s+/g, ' ');
        return t === want || t.startsWith(want);
      });
      if (!match) return false;
      match.click();
      return true;
    `);
  }

  async close(): Promise<void> {
    try {
      await this.call('Target.detachFromTarget', { sessionId: this.sessionId });
    } catch { /* ignore */ }
    this.ws.close();
  }
}
