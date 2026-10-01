#!/usr/bin/env python3
from pathlib import Path

p=Path("tools/ssd_hdd_video/render_real_media.py")
s=p.read_text(encoding="utf-8")

# V13.1 phrase-local semantic locks based on visual QA of the V13 smoke clips.
# These run immediately before grammatical subject carry-over so the visual is
# chosen for what is being explained RIGHT NOW, not for a noun in an earlier
# clause. Real media remains primary; diagrams are not introduced here.
marker='''    phrase_subject=detect_subject(phrase)\n'''
insert='''    # V13.1: when the narration is explicitly about BOTH SSD and HDD, show a\n    # real shot containing/comparing both storage categories rather than an\n    # arbitrary SSD-only or HDD-only close-up.\n    both_role_keys=[\n        "SSDとHDDは、どちらも", "SSDとHDDが", "大まかな役割は同じ",\n        "役割は同じ", "SSDにもHDDにも", "それぞれ違った故障要因",\n        "価格、容量、音、耐久性", "種類、速度", "価格、寿命",\n        "使い分けまで", "SSDとHDDそれぞれの",\n    ]\n    if any(k in phrase for k in both_role_keys):\n        return [\n            "hdd_ssd_disassembled", "pc_m2_hdd_inside",\n            "motherboard", "sata_vs_nvme",\n        ]\n\n    # Saving-data explanation: use actual storage products / installed storage,\n    # not an isolated HDD head macro.\n    if any(k in phrase for k in [\n        "写真や動画、ゲーム", "アプリなどのデータを保存",\n        "データを保存しておく", "保存しておくこと",\n        "ストレージとは何なのか",\n    ]):\n        return [\n            "hdd_ssd_disassembled", "external_hdds", "external_ssd",\n            "pc_m2_hdd_inside", "sata_ssd", "nvme_m2",\n        ]\n\n    # PC-inside role explanation must look like the inside of a PC.\n    if any(k in phrase for k in [\n        "パソコンの中で何をして", "パソコンの中にはCPUや",\n        "メモリ、グラフィックボード", "いろいろな部品が入って",\n        "その中でSSDとHDD", "担当しているのは",\n    ]):\n        return [\n            "pc_m2_hdd_inside", "motherboard", "computer_components_video",\n            "ram_ddr4", "ssd_install", "laptop_hdd_open",\n        ]\n\n    # Lifespan chapter: this sentence still refers to the HDD motor/head parts\n    # introduced immediately before it. Do not jump to SSD NAND mid-sentence.\n    if section=="第8章　寿命と故障はどう違う？" and any(k in phrase for k in [\n        "長く使えばそうした部品", "故障する可能性もあるので",\n    ]):\n        return [\n            "hdd_working_video", "hdd_open_photo", "hdd_head_macro",\n            "laptop_hdd_open", "hdd_side",\n        ]\n\n    # General lifespan factors apply to both technologies. Keep the imagery\n    # balanced unless the phrase explicitly names one technology.\n    if section=="第8章　寿命と故障はどう違う？" and any(k in phrase for k in [\n        "製品の品質や使用時間", "保存環境などで寿命",\n        "数字で決めることもできない",\n    ]):\n        return [\n            "hdd_ssd_disassembled", "pc_m2_hdd_inside",\n            "hdd_open_photo", "ssd_nand",\n        ]\n\n    # Intro roadmap / multi-factor comparison should visually compare storage,\n    # not cut to one unrelated product.\n    if section=="オープニング" and any(k in phrase for k in [\n        "速度や", "消費電力", "向いている使い方",\n        "仕組み、種類、速度", "価格、寿命",\n    ]):\n        return [\n            "hdd_ssd_disassembled", "pc_m2_hdd_inside",\n            "sata_vs_nvme", "motherboard",\n        ]\n\n    phrase_subject=detect_subject(phrase)\n'''
if marker not in s:
    raise SystemExit("V13.1 phrase_subject marker not found")
s=s.replace(marker,insert,1)
p.write_text(s,encoding="utf-8")
print("V13.1 semantic tightening patched")
