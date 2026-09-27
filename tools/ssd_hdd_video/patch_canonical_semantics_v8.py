#!/usr/bin/env python3
from pathlib import Path

p=Path("tools/ssd_hdd_video/render_real_media.py")
s=p.read_text(encoding="utf-8")

# Keep HDD_INTERNAL genuinely internal/mechanical. Product/context shots such
# as an external HDD beside a laptop are useful elsewhere, but are pedagogically
# wrong when the narration is specifically explaining platter/head motion.
old='HDD_INTERNAL=["hdd_working_video","hdd_open_photo","hdd_head_macro","laptop_hdd_open","hdd_side","hdd_ssd_disassembled","external_hdd_laptop"]'
new='HDD_INTERNAL=["hdd_working_video","hdd_open_photo","hdd_head_macro","laptop_hdd_open","hdd_side"]'
if old in s:
    s=s.replace(old,new,1)
elif new not in s:
    raise SystemExit("V8 HDD_INTERNAL marker not found")

# Add hard phrase-local semantic locks before carried grammatical subject is
# evaluated. This prevents an SSD subject from an earlier clause from leaking
# into a later 3-2-1/backup explanation, and prevents HDD mechanism wording from
# resolving to generic external-drive B-roll.
marker='''    hdd_mech=["プラッタ","ヘッド","5400RPM","7200RPM","RPM","CMR","SMR","モーター","回転機構","回転音","カリカリ","回転する","円盤","読み取り部分","読み取り","機械部品","そうした部品"]\n    ssd_mech=["NAND","TLC","QLC","コントローラー","TBW","フラッシュメモリ"]\n\n'''
insert='''    hdd_mech=["プラッタ","ヘッド","5400RPM","7200RPM","RPM","CMR","SMR","モーター","回転機構","回転音","カリカリ","回転する","円盤","読み取り部分","読み取り","機械部品","そうした部品"]\n    ssd_mech=["NAND","TLC","QLC","コントローラー","TBW","フラッシュメモリ"]\n\n    # V8.1: HDD chapter overview/definition cuts are not mechanism-specific.\n    # Use additional real HDD/context shots here so the chapter does not cycle\n    # only the same five internal-HDD images for roughly two minutes.  As soon\n    # as the narration mentions platter/head/rotation, the strict HDD_INTERNAL\n    # lock below takes over again.\n    if section=="第2章　HDDとは？" and (\n        phrase.strip()=="HDDとは？" or\n        "Hard Disk Drive" in phrase or\n        "HDDは、Hard Disk Drive" in full\n    ):\n        return [\n            "external_hdds", "external_hdd_laptop", "hdd_ssd_disassembled",\n            "hdd_side", "hdd_open_photo", "hdd_working_video",\n        ]\n\n    # V8 canonical semantic locks. These run before phrase_subject/subject_hint\n    # so a carried subject can never override the concept currently being said.\n    if any(k in phrase for k in hdd_mech):\n        return [\n            "hdd_working_video", "hdd_open_photo", "hdd_head_macro",\n            "laptop_hdd_open", "hdd_side",\n        ]\n\n    if section=="第9章　バックアップは必要":\n        deliberate_single=(\n            "高性能なSSD一台" in phrase or\n            "大容量HDD一台" in phrase or\n            "SSD一台" in phrase or\n            "HDD一台" in phrase\n        )\n        backup_keys=[\n            "ストレージ一台だけ", "SSDかHDDかを", "バックアップに",\n            "別の場所", "同じデータ", "3-2-1", "合計3つ",\n            "2種類の保存先", "一台が壊れても", "壊れてもデータが残る",\n            "データが残る状態", "本当に消したくない",\n            "重要なのは絶対に壊れない",\n        ]\n        if not deliberate_single and ("バックアップ" in phrase or any(k in phrase for k in backup_keys)):\n            return [\n                "nas", "nas_drive_bay", "external_hdds",\n                "external_hdd_laptop", "server_rack",\n                "pc_m2_hdd_inside", "hdd_ssd_disassembled",\n            ]\n\n'''
if marker in s:
    s=s.replace(marker,insert,1)
elif "# V8 canonical semantic locks." not in s:
    raise SystemExit("V8 contextual_pool marker not found")

p.write_text(s,encoding="utf-8")
print("canonical semantics v8.1 patched")
