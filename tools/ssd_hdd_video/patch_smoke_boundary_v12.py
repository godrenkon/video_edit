#!/usr/bin/env python3
from pathlib import Path

P=Path('tools/ssd_hdd_video/render_real_media.py')
s=P.read_text(encoding='utf-8')

# Smoke tests intentionally crop a fixed time range from the full timeline.
# That crop can cut the first/last narration phrase in the middle and create a
# sub-0.80s edge fragment which does not exist in the full production render.
# Keep the normal full-render QA strict; exempt only consecutive short events
# touching the beginning/end of a smoke-window event list.
marker='blink_fast=[\n    e for e in events\n    if e["en"]-e["st"] < 0.80 and e["row"]["section"]!="次回"\n]\n'
if marker not in s:
    raise SystemExit('V12 smoke-boundary patch: current blink_fast block not found')

insert = marker + '''if __import__("os").environ.get("SSD_HDD_SMOKE_SECONDS") and events:\n    _edge_short_n=set()\n    for _e in events:\n        if (_e["en"]-_e["st"]) < 0.80:\n            _edge_short_n.add(_e["n"])\n        else:\n            break\n    for _e in reversed(events):\n        if (_e["en"]-_e["st"]) < 0.80:\n            _edge_short_n.add(_e["n"])\n        else:\n            break\n    _before=len(blink_fast)\n    blink_fast=[_e for _e in blink_fast if _e["n"] not in _edge_short_n]\n    if _before != len(blink_fast):\n        print("V12 smoke boundary: ignored", _before-len(blink_fast), "clipped edge fragment(s)")\n'''

s=s.replace(marker,insert,1)
P.write_text(s,encoding='utf-8')
print('V12 smoke-boundary patch applied; full-render 0.80s QA unchanged')
