// Persistent single-WebSocket CDP bridge for Meshy automation on 127.0.0.1:49222.
// Keeps one WebSocket open so Chrome does not re-prompt for remote debugging permissions.
import http from 'node:http';
import { MeshyCdp } from './cdp.ts';

const PORT = 49222;
const cdp = await MeshyCdp.connect();
const downloads: { guid: string; suggestedFilename?: string; state: string; filePath?: string }[] = [];

cdp.onEvent((method, params) => {
  if (method === 'Browser.downloadWillBegin') {
    downloads.push({
      guid: String(params.guid),
      suggestedFilename: String(params.suggestedFilename ?? ''),
      state: 'inProgress',
    });
  } else if (method === 'Browser.downloadProgress') {
    const item = downloads.find((d) => d.guid === String(params.guid));
    if (item) {
      item.state = String(params.state ?? item.state);
      if (params.filePath) item.filePath = String(params.filePath);
    }
  }
});

const server = http.createServer(async (req, res) => {
  const send = (code: number, obj: unknown) => {
    res.writeHead(code, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(obj));
  };
  try {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const bodyStr = Buffer.concat(chunks).toString('utf8');
    const body = bodyStr ? (JSON.parse(bodyStr) as Record<string, unknown>) : {};

    if (req.url === '/status') {
      const credits = await cdp.getCredits().catch(() => null);
      return send(200, { connected: true, url: cdp.target.url, credits, downloads });
    }
    if (req.url === '/eval') {
      const out = await cdp.evalJson(String(body.expr ?? 'null'));
      return send(200, { ok: true, result: out });
    }
    if (req.url === '/screenshot') {
      const outPath = String(body.outPath);
      await cdp.screenshot(outPath);
      return send(200, { ok: true, outPath });
    }
    if (req.url === '/download-dir') {
      await cdp.setDownloadDir(String(body.absDir));
      return send(200, { ok: true });
    }
    if (req.url === '/downloads') {
      return send(200, { ok: true, downloads });
    }
    if (req.url === '/shutdown') {
      send(200, { ok: true });
      await cdp.close();
      server.close();
      process.exit(0);
    }
    return send(404, { error: 'not found' });
  } catch (e) {
    return send(500, { error: e instanceof Error ? e.message : String(e) });
  }
});

server.listen(PORT, '127.0.0.1', async () => {
  const credits = await cdp.getCredits().catch(() => null);
  console.log(JSON.stringify({ status: 'READY', port: PORT, url: cdp.target.url, credits }));
});
