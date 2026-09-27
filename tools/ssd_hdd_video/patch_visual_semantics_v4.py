#!/usr/bin/env python3
from pathlib import Path
import runpy

p=Path("tools/ssd_hdd_video/render_real_media.py")
s=p.read_text(encoding="utf-8")

# This patch runs AFTER patch_subject_tracking_v2.py. At that point
# contextual_pool() already has phrase-local backup/archive overrides.
# Add stronger role/conclusion semantics immediately before phrase_subject.
marker='''    phrase_subject=detect_subject(phrase)\n'''
insert='''    # Explicit role assignment should always use the corresponding real media,\n    # regardless of any grammatical subject carried from the previous phrase.\n    if any(k in phrase for k in ["全部SSD", "SSDにする", "SSD中心", "SSDだけ"]):\n        return [\n            "sata_ssd", "crucial_ssd", "nvme_m2",\n            "m2_installed", "external_ssd", "ssd_install",\n        ]\n\n    if any(k in phrase for k in ["HDDを多く", "HDD中心", "HDDを多め", "多く使う構成"]):\n        if "HDD" in full:\n            return [\n                "external_hdds", "nas", "nas_drive_bay",\n                "hdd_side", "external_hdd_laptop", "server_rack",\n            ]\n\n    # Decision/principle wording is about choosing between BOTH storage types.\n    # Never show only a lone SSD or lone HDD for these phrases.\n    if any(k in phrase for k in [\n        "速度と容量", "どちらを重視", "どちらを優先", "何を保存したい",\n        "名前だけで判断", "それぞれの特徴", "特徴を理解",\n        "自分の用途", "用途に合った", "選ぶこと", "どっちを選ぶ",\n        "どちらが完全に上", "どちらが上",\n    ]):\n        return [\n            "hdd_ssd_disassembled",\n            "pc_m2_hdd_inside",\n            "motherboard",\n            "computer_components_video",\n        ]\n\n    phrase_subject=detect_subject(phrase)\n'''
if marker not in s:
    raise SystemExit("phrase_subject insertion marker not found")
s=s.replace(marker,insert,1)

p.write_text(s,encoding="utf-8")
print("visual semantics v4.1 patched")

# V8 is canonical rather than QA-only: it narrows HDD mechanism imagery to
# actual platter/head hardware and locks backup explanations to genuine backup
# media before any carried HDD/SSD grammatical subject can interfere.  Chain it
# here because both fast semantic QA and the production renderer already invoke
# this V4 patch, guaranteeing identical semantics in both paths.
runpy.run_path("tools/ssd_hdd_video/patch_canonical_semantics_v8.py", run_name="__main__")
