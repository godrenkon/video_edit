#!/usr/bin/env python3
from pathlib import Path
import runpy

p=Path("tools/ssd_hdd_video/render_real_media.py")
s=p.read_text(encoding="utf-8")

old='''    return [x for x in merged if x] or [text.rstrip("。")]\n\ndef timed_phrases(row):\n'''
new='''    # A subtitle phrase is also a visual-edit unit. If one phrase crosses a\n    # storage-role boundary, split it even when the normal tokenizer would keep\n    # the text together. Example:\n    #   「SSDへ置いて、写真や完成した動画、」\n    # must become:\n    #   「SSDへ置いて、」 / 「写真や完成した動画、」\n    # so the first cut can show SSD media and the second can show archive/storage\n    # media. The same rule applies to HDD assignment phrases.\n    role_markers=(\n        "SSDへ置いて、", "HDDへ置いて、",\n        "SSDに置いて、", "HDDに置いて、",\n        "SSDへ保存して、", "HDDへ保存して、",\n        "SSDに保存して、", "HDDに保存して、",\n    )\n\n    refined=[]\n    for phrase in merged:\n        queue=[phrase]\n        for marker in role_markers:\n            next_queue=[]\n            for q in queue:\n                pos=q.find(marker)\n                end=pos+len(marker) if pos>=0 else -1\n                if pos>=0 and 0 < end < len(q):\n                    left=q[:end].strip()\n                    right=q[end:].strip()\n                    if left:\n                        next_queue.append(left)\n                    if right:\n                        next_queue.append(right)\n                else:\n                    next_queue.append(q)\n            queue=next_queue\n        refined.extend(queue)\n\n    # Also split an archive/backup concept away from a preceding SSD assignment\n    # when punctuation was omitted by the narration tokenizer. Never split words;\n    # these are explicit semantic markers only.\n    archive_markers=(\n        "バックアップ", "大量に保存", "保存しておきたい",\n        "アーカイブ", "保管しておきたい",\n    )\n    final=[]\n    for phrase in refined:\n        split_at=None\n        for marker in archive_markers:\n            pos=phrase.find(marker)\n            if pos>3 and any(x in phrase[:pos] for x in ("SSD", "HDD", "写真", "動画")):\n                split_at=pos\n                break\n        if split_at is not None:\n            left=phrase[:split_at].strip()\n            right=phrase[split_at:].strip()\n            if left:\n                final.append(left)\n            if right:\n                final.append(right)\n        else:\n            final.append(phrase)\n\n    return [x for x in final if x] or [text.rstrip("。")]\n\ndef timed_phrases(row):\n'''

if old not in s:
    raise SystemExit("semantic_phrases return marker not found")
s=s.replace(old,new,1)
p.write_text(s,encoding="utf-8")
print("phrase boundaries v5 patched")

# V6 inserts the deterministic near-repeat machinery. V7 then inserts the
# explanatory semantic-specificity pass immediately before the V6 finalizer,
# so runtime order is: semantic specificity -> no-near-repeat invariant.
runpy.run_path("tools/ssd_hdd_video/patch_near_repeat_v6.py", run_name="__main__")
runpy.run_path("tools/ssd_hdd_video/patch_semantic_specificity_v7.py", run_name="__main__")
