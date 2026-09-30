#!/usr/bin/env python3
from pathlib import Path

P=Path('tools/ssd_hdd_video/render_real_media.py')
s=P.read_text(encoding='utf-8')

# 1) Phrase-level media locks. These run before broad HDD/SSD subject pools.
needle='''    phrase_subject=detect_subject(phrase)\n    effective=phrase_subject or subject_hint\n\n    hdd_mech=['''
insert='''    phrase_subject=detect_subject(phrase)\n    effective=phrase_subject or subject_hint\n\n    # V9: strict phrase-level locks for shapes / standards / mechanisms.\n    # Do not let a broad chapter pool override the object currently being explained.\n    types_chapter = "種類" in section\n    speed_chapter = "速度" in section\n\n    # 2.5-inch SATA SSD: show actual SATA SSD media, never an M.2/mSATA-only image.\n    # Keep at least three semantically correct choices so the near-repeat guard\n    # can avoid A-B-A without falling back to an unrelated asset.\n    if types_chapter and effective=="SSD" and (\n        "2.5インチ" in combined or "薄い箱" in phrase or "SATA SSD" in phrase\n    ) and not any(k in phrase for k in ["M.2","NVMe"]):\n        return ["sata_ssd","crucial_ssd","sata_vs_nvme"]\n\n    # M.2 / NVMe: prioritize long M.2 modules and installed M.2 examples.\n    if types_chapter and (\n        any(k in phrase for k in ["M.2","NVMe","細長い基板"]) or\n        (any(k in full for k in ["M.2","NVMe"]) and any(k in phrase for k in ["もう一つよく見る","同じ意味ではない","わけではない"]))\n    ):\n        if "SATA" in phrase and "NVMe" not in phrase:\n            return ["sata_vs_nvme","sata_ssd","crucial_ssd"]\n        return ["nvme_m2","m2_installed","laptop_nvme","sata_vs_nvme"]\n\n    # HDD physical sizes.\n    if types_chapter and effective=="HDD" and any(k in combined for k in ["3.5インチ","2.5インチ","5400RPM","7200RPM","回転数"]):\n        return ["hdd_side","laptop_hdd_open","hdd_working_video","hdd_open_photo"]\n\n    # CMR/SMR are recording methods; a dedicated diagram is clearer than NAS/product imagery.\n    if types_chapter and any(k in phrase for k in ["CMR","SMR","記録方式","トラック"]):\n        return ["hdd_diagram","hdd_open_photo","hdd_working_video"]\n\n    # Speed sentence that contrasts SATA and NVMe: follow the CURRENT phrase, not the full sentence.\n    if speed_chapter and "SATA SSD" in phrase:\n        return ["sata_ssd","crucial_ssd","sata_vs_nvme"]\n    if speed_chapter and ("NVMe" in phrase or ("さらに大きな数字" in phrase and "NVMe" in full)):\n        return ["nvme_m2","m2_installed","laptop_nvme","sata_vs_nvme"]\n\n    # NAND/TLC/QLC/controller explanations should show the PCB/chips themselves.\n    if effective=="SSD" and any(k in phrase for k in ["NAND","TLC","QLC","コントローラー","セル","フラッシュメモリ"]):\n        return ["ssd_nand","ssd_controller","ssd_diagram"]\n\n    hdd_mech=['''
if needle not in s:
    raise SystemExit('V9 contextual_pool insertion target not found')
s=s.replace(needle,insert,1)

# 2) Never select a multi-character crop from the official Zundamon sheet.
start=s.find('def choose_zundamon_pose(')
if start < 0:
    raise SystemExit('choose_zundamon_pose not found')
end=s.find('\n\ndef ',start+10)
if end < 0:
    raise SystemExit('choose_zundamon_pose end not found')
new_choose='''def choose_zundamon_pose(poses, event_no, text, section):\n    # V9: some source-sheet crops can still contain two characters side-by-side.\n    # Keep only portrait-shaped crops; if none qualify, use the narrowest crop.\n    measured=[]\n    for p in poses:\n        try:\n            im=Image.open(p).convert("RGBA")\n            bb=im.getchannel("A").getbbox()\n            if bb:\n                w=bb[2]-bb[0]; h=bb[3]-bb[1]\n            else:\n                w,h=im.size\n            ratio=w/max(1,h)\n            measured.append((ratio,p))\n        except Exception:\n            measured.append((99.0,p))\n    singles=[p for ratio,p in measured if ratio <= 0.72]\n    if not singles:\n        singles=[min(measured,key=lambda x:x[0])[1]]\n\n    # Change presentation gently, but never display more than one Zundamon at once.\n    if len(singles)==1:\n        return singles[0]\n    hot=("？","?","≠","注意","つまり","ポイント","重要","どっち","結局")\n    if any(k in text for k in hot):\n        idx=1 % len(singles)\n    elif "バックアップ" in section or "寿命" in section:\n        idx=2 % len(singles)\n    else:\n        idx=(event_no//5) % len(singles)\n    return singles[idx]\n'''
s=s[:start]+new_choose+s[end:]

# 3) Zundamon should support the explanation, not cover the real material.
s=s.replace('scale=-1:640,setpts=PTS-STARTPTS[z]', 'scale=-1:520,setpts=PTS-STARTPTS[z]')

P.write_text(s,encoding='utf-8')
print('V9 precision patch applied')

# 2026-09-30: retrigger V10 after relaxing V6 from A-B-A prohibition to
# adjacent-duplicate-only spacing. Semantic correctness now wins over arbitrary
# three-cut uniqueness while the 4.05s hold limit and adjacent-repeat QA remain.
