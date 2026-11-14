#!/usr/bin/env python3
"""Parse harness HLOG.TXT records '(n tick xv yv level (x y xvel yvel dir state))' -> CSV + summary JSON.
Usage: analyze_hlog.py HLOG.TXT OUT_PREFIX
"""
import re, sys, json, csv, hashlib

REC = re.compile(r'\((-?\d+) (-?\d+) (-?\d+) (-?\d+) (\S*) ?\(([^()]*)\)\)')
FIELDS = ['x', 'y', 'xvel', 'yvel', 'dir', 'state', 'xacel', 'yacel', 'fx', 'fy', 'fxvel', 'fyvel', 'fxacel', 'fyacel', 'gravity']

def parse(path):
    raw = open(path, 'rb').read()
    rows = []
    for m in REC.finditer(raw.decode('latin1')):
        n, tick, xv, yv = map(int, m.group(1, 2, 3, 4))
        lvl = m.group(5)
        vals = [(1 if v == 'T' else 0 if v == 'nil' else int(v)) for v in m.group(6).split()]
        r = dict(n=n, tick=tick, xv=xv, yv=yv, level=lvl)
        r.update(zip(FIELDS, vals))
        rows.append(r)
    return raw, rows

def main(path, out):
    raw, rows = parse(path)
    with open(out + '.csv', 'w', newline='') as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader(); w.writerows(rows)
    play = [r for r in rows if r['level']]
    # per-step dx: record n holds state observed before input n is applied; dx[n] = x[n+1]-x[n]
    for a, b in zip(play, play[1:]):
        a['dx'] = b['x'] - a['x']; a['dy'] = b['y'] - a['y']
    seg = lambda lo, hi: [r for r in play if lo <= r['n'] < hi]
    def stats(rs):
        return dict(n=[rs[0]['n'], rs[-1]['n']] if rs else None,
                    x=[rs[0]['x'], rs[-1]['x']] if rs else None,
                    xvel=sorted(set(r['xvel'] for r in rs)),
                    dx=[r.get('dx') for r in rs][:24])
    summary = dict(
        input_sha256=hashlib.sha256(raw).hexdigest(), records=len(rows), play_records=len(play),
        spawn=dict(x=play[0]['x'], y=play[0]['y']) if play else None,
        land_y=next((r['y'] for r in play if r['state'] == 6), None),
        idle=stats(seg(20, 40)), right=stats(seg(40, 100)), release=stats(seg(100, 140)),
        left=stats(seg(140, 340)), after=stats(seg(340, 380)), jump=[(r['n'], r['x'], r['y'], r['yvel'], r['state']) for r in seg(378, 410)],
        left_wall_x=min(r['x'] for r in seg(140, 340)) if seg(140, 340) else None,
        left_blocked_ticks=sum(1 for r in seg(140, 340) if r.get('dx') == 0),
    )
    json.dump(summary, open(out + '.summary.json', 'w'), indent=1)
    print(json.dumps(summary, indent=1)[:3000])

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
