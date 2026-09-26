#!/usr/bin/env python3
from pathlib import Path

p=Path("tools/ssd_hdd_video/render_real_media.py")
s=p.read_text(encoding="utf-8")

# This patch runs AFTER patch_subject_tracking_v2.py. At that point
# contextual_pool() already has phrase-local backup/archive overrides.
# Add stronger role/conclusion semantics immediately before phrase_subject.
marker='''    phrase_subject=detect_subject(phrase)\n'''
insert='''    # Explicit role assignment should always use the corresponding real media,\n    # regardless of any grammatical subject carried from the previous phrase.\n    if any(k in phrase for k in ["全部SSD", "SSDにする", "SSD中心", "SSDだけ"]):\n        return [\n            "sata_ssd", "crucial_ssd", "nvme_m2",\n            "m2_installed", "external_ssd", "ssd_install",\n        ]\n\n    if any(k in phrase for k in ["HDDを多く", "HDD中心", "HDDを多め", "多く使う構成"]):\n        if "HDD" in full:\n            return [\n                "external_hdds", "nas", "nas_drive_bay",\n                "hdd_side", "external_hdd_laptop", "server_rack",\n            ]\n\n    # Final recommendation/principle wording is about choosing between both\n    # storage types. Use neutral comparison/context media instead of inheriting\n    # whichever device happened to be mentioned immediately beforehand.\n    if any(k in phrase for k in [\n        "名前だけで判断", "それぞれの特徴", "特徴を理解",\n        "自分の用途", "用途に合った", "選ぶこと", "どっちを選ぶ",\n    ]):\n        return [\n            "hdd_ssd_disassembled", "sata_vs_nvme",\n            "pc_m2_hdd_inside", "motherboard",\n            "sata_ssd", "hdd_side",\n        ]\n\n    phrase_subject=detect_subject(phrase)\n'''
if marker not in s:
    raise SystemExit("phrase_subject insertion marker not found")
s=s.replace(marker,insert,1)

p.write_text(s,encoding="utf-8")
print("visual semantics v4 patched")
