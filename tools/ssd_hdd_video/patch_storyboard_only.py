#!/usr/bin/env python3
from pathlib import Path

p=Path("tools/ssd_hdd_video/render_real_media.py")
s=p.read_text(encoding="utf-8")

marker='''clips=[]\nfor e in events:\n'''
insert='''# Fast semantic-QA mode: stop after storyboard generation and all semantic\n# guards, before any expensive video encoding. Full renders leave this off.\nif os.environ.get("SSD_HDD_STORYBOARD_ONLY", "0") == "1":\n    print("STORYBOARD_ONLY_OK", len(events), "events")\n    print(OUT/"storyboard.tsv")\n    raise SystemExit(0)\n\nclips=[]\nfor e in events:\n'''
if marker not in s:
    raise SystemExit("storyboard-only insertion marker not found")
s=s.replace(marker,insert,1)
p.write_text(s,encoding="utf-8")
print("storyboard-only mode patched")
