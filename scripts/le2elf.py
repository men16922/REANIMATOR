#!/usr/bin/env python3
"""Parse a DOS/4GW-bound LE executable, apply internal fixups, emit ELF32 i386.

Transformation for analysis only. Output maps LE objects 1:1 to ELF PT_LOAD
segments at their LE relocation base addresses. A JSON report records header
fields, object table, fixup statistics and the entry point so every address in
the ELF can be mapped back to (object, offset) and file offset in the original.

Usage: le2elf.py IN.EXE OUT.elf OUT.json
"""
import json, struct, sys, hashlib

def u8(b, o): return b[o]
def u16(b, o): return struct.unpack_from('<H', b, o)[0]
def u32(b, o): return struct.unpack_from('<I', b, o)[0]

def find_le(b):
    o = 0
    while True:
        o = b.find(b'MZ', o)
        if o < 0: raise SystemExit('no LE header')
        if o + 0x40 <= len(b):
            l = u32(b, o + 0x3c)
            if o + l + 2 <= len(b) and b[o + l:o + l + 2] == b'LE':
                return o, o + l
        o += 2

def main(inp, outp, rep):
    b = open(inp, 'rb').read()
    mz, le = find_le(b)
    H = lambda off: u32(b, le + off)
    hdr = dict(
        cpu=u16(b, le + 0x08), os=u16(b, le + 0x0a), module_flags=H(0x10),
        num_pages=H(0x14), eip_obj=H(0x18), eip=H(0x1c), esp_obj=H(0x20), esp=H(0x24),
        page_size=H(0x28), last_page_bytes=H(0x2c), fixup_section_size=H(0x30),
        obj_table=H(0x40), num_objs=H(0x44), page_table=H(0x48),
        fixup_page_table=H(0x68), fixup_record_table=H(0x6c),
        import_mod_table=H(0x70), num_import_mods=H(0x74),
        data_pages=H(0x80), num_preload=H(0x84),
    )
    psz = hdr['page_size']
    # LE: data_pages offset is relative to start of file (bound: start of the inner MZ? -> test both)
    objs = []
    for i in range(hdr['num_objs']):
        o = le + hdr['obj_table'] + i * 24
        vsize, base, flags, pti, npe, _ = struct.unpack_from('<IIIIII', b, o)
        objs.append(dict(index=i + 1, vsize=vsize, base=base, flags=flags,
                         page_index=pti, num_pages=npe,
                         readable=bool(flags & 1), writable=bool(flags & 2),
                         executable=bool(flags & 4), big=bool(flags & 0x2000)))
    # page table entries (LE: 4 bytes: 3-byte page number (big endian-ish) + flags)
    pages = []
    for i in range(hdr['num_pages']):
        o = le + hdr['page_table'] + i * 4
        num = (b[o] << 16) | (b[o + 1] << 8) | b[o + 2]
        pages.append(dict(num=num, flags=b[o + 3]))
    # choose data_pages base: absolute file offset in standard LE; for bound DOS/4GW, relative to inner MZ
    cand = [hdr['data_pages'], mz + hdr['data_pages']]
    data_base = None
    for c in cand:
        if c + (hdr['num_pages'] - 1) * psz + hdr['last_page_bytes'] <= len(b):
            data_base = c
            # prefer the one where final page ends nearest EOF
    ends = {c: c + (hdr['num_pages'] - 1) * psz + hdr['last_page_bytes'] for c in cand}
    fits = [c for c in cand if ends[c] <= len(b)]
    data_base = max(fits, key=lambda c: ends[c])

    def page_file_off(pnum):
        return data_base + (pnum - 1) * psz

    def page_len(pnum):
        return hdr['last_page_bytes'] if pnum == hdr['num_pages'] else psz

    # build object images
    images = {}
    for ob in objs:
        img = bytearray(ob['vsize'] if ob['vsize'] else 0)
        for k in range(ob['num_pages']):
            pidx = ob['page_index'] + k  # 1-based logical page
            pe = pages[pidx - 1]
            if pe['flags'] not in (0,):
                continue  # only legal physical pages handled
            src = page_file_off(pe['num'])
            n = page_len(pe['num'])
            dst = k * psz
            chunk = b[src:src + n]
            end = min(len(img), dst + len(chunk))
            if dst < len(img):
                img[dst:end] = chunk[:end - dst]
        images[ob['index']] = img

    # fixups
    stats = dict(total=0, internal=0, by_src_type={}, skipped_import=0, skipped_other=0, unhandled=[])
    fpt = le + hdr['fixup_page_table']
    frt = le + hdr['fixup_record_table']
    page_owner = {}
    for ob in objs:
        for k in range(ob['num_pages']):
            page_owner[ob['page_index'] + k] = (ob, k)
    for lp in range(1, hdr['num_pages'] + 1):
        start = u32(b, fpt + (lp - 1) * 4)
        end = u32(b, fpt + lp * 4)
        p = frt + start
        pend = frt + end
        ob, k = page_owner.get(lp, (None, None))
        while p < pend:
            src = b[p]; flg = b[p + 1]; p += 2
            stype = src & 0x0f
            srclist = bool(src & 0x20)
            if srclist:
                cnt = b[p]; p += 1
            else:
                srcoff = struct.unpack_from('<h', b, p)[0]; p += 2
            ttype = flg & 3
            if ttype == 0:  # internal reference
                if flg & 0x40:
                    tobj = u16(b, p); p += 2
                else:
                    tobj = b[p]; p += 1
                if stype == 2:  # 16-bit selector: no offset
                    toff = 0
                elif flg & 0x10:
                    toff = u32(b, p); p += 4
                else:
                    toff = u16(b, p); p += 2
            else:
                # import/entry fixups: parse size and skip
                if flg & 0x40: p += 2
                else: p += 1
                if ttype in (1, 2):
                    if ttype == 1:
                        p += 4 if (flg & 0x10) else 2
                    else:
                        p += 4 if (flg & 0x80) else 2
                if flg & 0x04:
                    p += 4 if (flg & 0x20) else 2
                stats['skipped_import'] += 1
                if srclist: p += 2 * cnt
                continue
            offs = [struct.unpack_from('<h', b, p + 2 * i)[0] for i in range(cnt)] if srclist else [srcoff]
            if srclist: p += 2 * cnt
            if ob is None: continue
            tbase = next(o['base'] for o in objs if o['index'] == tobj)
            target = tbase + toff
            img = images[ob['index']]
            for so in offs:
                stats['total'] += 1
                stats['by_src_type'][stype] = stats['by_src_type'].get(stype, 0) + 1
                at = k * psz + so
                if stype == 7:  # 32-bit offset
                    if 0 <= at and at + 4 <= len(img):
                        struct.pack_into('<I', img, at, target & 0xffffffff)
                        stats['internal'] += 1
                elif stype == 8:  # 32-bit self-relative
                    srcaddr = ob['base'] + at
                    if 0 <= at and at + 4 <= len(img):
                        struct.pack_into('<I', img, at, (target - (srcaddr + 4)) & 0xffffffff)
                        stats['internal'] += 1
                elif stype == 5:  # 16-bit offset
                    if 0 <= at and at + 2 <= len(img):
                        struct.pack_into('<H', img, at, target & 0xffff)
                        stats['internal'] += 1
                elif stype in (2, 3, 6):  # selector / 16:16 / 16:32 pointers: leave selector bytes
                    if stype == 6 and 0 <= at and at + 4 <= len(img):
                        struct.pack_into('<I', img, at, target & 0xffffffff)
                    stats['skipped_other'] += 1
                else:
                    if len(stats['unhandled']) < 20:
                        stats['unhandled'].append(dict(page=lp, src=stype, flg=flg))

    # emit ELF32
    entry_obj = next(o for o in objs if o['index'] == hdr['eip_obj'])
    entry = entry_obj['base'] + hdr['eip']
    phnum = len(objs)
    ehsize, phsize = 52, 32
    off = ehsize + phsize * phnum
    off = (off + 0xfff) & ~0xfff
    ph = b''; body = b''; segs = []
    for ob in objs:
        img = bytes(images[ob['index']])
        fl = (4 if ob['readable'] else 0) | (2 if ob['writable'] else 0) | (1 if ob['executable'] else 0)
        ph += struct.pack('<IIIIIIII', 1, off + len(body), ob['base'], ob['base'], len(img), len(img), fl, 0x1000)
        segs.append(dict(obj=ob['index'], vaddr=hex(ob['base']), size=len(img), elf_offset=off + len(body)))
        body += img
        pad = (-len(body)) % 0x1000
        body += b'\0' * pad
    eh = b'\x7fELF' + bytes([1, 1, 1, 0]) + b'\0' * 8
    eh += struct.pack('<HHIIIIIHHHHHH', 2, 3, 1, entry, ehsize, 0, 0, ehsize, phsize, phnum, 40, 0, 0)
    out = eh + ph
    out += b'\0' * (off - len(out)) + body
    open(outp, 'wb').write(out)
    report = dict(
        input=inp, input_sha256=hashlib.sha256(b).hexdigest(), inner_mz_offset=hex(mz), le_header_offset=hex(le),
        data_pages_file_base=hex(data_base), header=hdr, objects=objs, entry=hex(entry),
        fixups=stats, elf=outp, elf_sha256=hashlib.sha256(out).hexdigest(), segments=segs,
        mapping_rule='elf_vaddr = object.base + object_offset; original_file_offset = data_pages_file_base + (page.num-1)*page_size + (object_offset % page_size) for page index object.page_index + object_offset//page_size',
        limitations=['import fixups skipped (DOS/4GW has none expected)', 'selector fixups (16-bit) left as-is', 'iterated/invalid pages not expanded'])
    json.dump(report, open(rep, 'w'), indent=1)
    print(json.dumps(dict(objects=[(o['index'], hex(o['base']), hex(o['vsize']), o['executable']) for o in objs], entry=hex(entry), fixups={k: v for k, v in stats.items() if k != 'unhandled'}, unhandled=len(stats['unhandled']), page_flags=sorted(set(p['flags'] for p in pages))), indent=None))

if __name__ == '__main__':
    main(*sys.argv[1:4])
