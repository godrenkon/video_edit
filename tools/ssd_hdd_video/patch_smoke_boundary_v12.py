#!/usr/bin/env python3
from pathlib import Path

P=Path('tools/ssd_hdd_video/render_real_media.py')
s=P.read_text(encoding='utf-8')

# Earlier precision QA correctly rejects genuine visual cuts below 0.80 s.
# Smoke tests, however, deliberately slice a fixed time window out of the full
# timeline. If that window ends in the middle of a sentence it can leave one or
# more tiny fragments at the *edge* of the smoke range (e.g. 0.14 s / 0.10 s).
# Those fragments do not exist in the full production render and must not be
# mistaken for real blink-fast edits. Keep the full-render invariant untouched
# and exempt only consecutive short fragments touching a smoke-window edge.
needle='blink-fast visual event below 0.80s'
pos=s.find(needle)
if pos < 0:
    raise SystemExit('V12 smoke-boundary patch: blink-fast QA marker not found')

# Locate the nearest preceding `if blink_fast:` guarding the RuntimeError.
scan=pos
if_start=-1
for _ in range(40):
    line_start=s.rfind('\n',0,scan)
    if line_start < 0:
        break
    prev=s.rfind('\n',0,line_start)
    line=s[prev+1:line_start]
    if line.strip()=='if blink_fast:':
        if_start=prev+1
        indent=line[:len(line)-len(line.lstrip())]
        break
    scan=prev

if if_start < 0:
    raise SystemExit('V12 smoke-boundary patch: `if blink_fast:` not found near QA marker')

insert=(
    indent + '# V12: fixed-duration smoke windows can clip a sentence at the first/last edge.\n' +
    indent + '# Exempt only consecutive <0.80 s edge fragments; internal short cuts still fail.\n' +
    indent + 'if __import__("os").environ.get("SSD_HDD_SMOKE_SECONDS"):\n' +
    indent + '    _edge_short_ids=set()\n' +
    indent + '    for _e in events:\n' +
    indent + '        if (_e["en"]-_e["st"]) < 0.80:\n' +
    indent + '            _edge_short_ids.add(id(_e))\n' +
    indent + '        else:\n' +
    indent + '            break\n' +
    indent + '    for _e in reversed(events):\n' +
    indent + '        if (_e["en"]-_e["st"]) < 0.80:\n' +
    indent + '            _edge_short_ids.add(id(_e))\n' +
    indent + '        else:\n' +
    indent + '            break\n' +
    indent + '    _before=len(blink_fast)\n' +
    indent + '    blink_fast=[_e for _e in blink_fast if id(_e) not in _edge_short_ids]\n' +
    indent + '    if _before != len(blink_fast):\n' +
    indent + '        print("V12 smoke boundary: ignored", _before-len(blink_fast), "clipped edge fragments")\n'
)

s=s[:if_start]+insert+s[if_start:]
P.write_text(s,encoding='utf-8')
print('V12 smoke-boundary patch applied; full-render 0.80s QA unchanged')
