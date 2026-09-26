#!/usr/bin/env python3
from pathlib import Path

p=Path("tools/ssd_hdd_video/render_real_media.py")
s=p.read_text(encoding="utf-8")

# Keep chapter-title/gap visuals on the same semantic selector used by narration.
old_gap='pool=[x for x in pool_for(row["section"],gap_row["text"]) if optional_asset(x)]'
new_gap='pool=[x for x in contextual_pool(row["section"],gap_row["text"],gap_row["text"],None) if optional_asset(x)]'
if old_gap in s:
    s=s.replace(old_gap,new_gap,1)

# Phrase-local semantic intent must beat a subject carried from the previous
# subtitle phrase. This is especially important in a mixed sentence such as
# "...SSDへ置いて、写真や完成した動画、バックアップなど大量に保存して...HDDへ...".
# Without these overrides, the middle backup/archive clause can incorrectly
# inherit SSD and show NVMe media even though the spoken concept is archival
# storage / backup.
pool_marker='''    combined=(full+" "+phrase).strip()\n\n    phrase_subject=detect_subject(phrase)\n'''
pool_repl='''    combined=(full+" "+phrase).strip()\n\n    # Backup/archive concepts are visually stronger than a carried SSD/HDD\n    # grammatical subject. Prefer NAS/external-drive/server real media.\n    if any(k in phrase for k in ["バックアップ", "別の場所", "クラウド", "3-2-1"]):\n        return [\n            "nas", "nas_drive_bay", "external_hdds",\n            "external_hdd_laptop", "external_ssd", "server_rack",\n        ]\n\n    # Large-capacity/archive wording should show capacity-oriented media even\n    # when the previous clause happened to mention SSD.\n    if any(k in phrase for k in ["大量に保存", "大容量", "保存しておきたい", "保管", "アーカイブ"]):\n        return [\n            "external_hdds", "nas", "nas_drive_bay", "hdd_side",\n            "external_ssd", "server_rack",\n        ]\n\n    # Boundary clauses that enumerate photos / completed videos in a sentence\n    # which later assigns HDD should stay neutral rather than falsely implying\n    # that only the previously named SSD is being discussed.\n    if any(k in phrase for k in ["写真", "完成した動画", "完成済み", "撮影素材"]):\n        if "SSD" in full and "HDD" in full:\n            return [\n                "hdd_ssd_disassembled", "external_hdds", "external_ssd",\n                "nas", "pc_m2_hdd_inside", "sata_vs_nvme",\n            ]\n\n    # A trailing summary clause like 「置くという使い分けもできる」 refers to\n    # the SSD/HDD assignment as a whole. Do not inherit only the preceding HDD\n    # or SSD subject; show both-device / PC-context real media instead.\n    if "使い分け" in phrase and "SSD" in full and "HDD" in full:\n        return [\n            "hdd_ssd_disassembled",\n            "pc_m2_hdd_inside",\n            "sata_vs_nvme",\n            "motherboard",\n        ]\n\n    phrase_subject=detect_subject(phrase)\n'''
if pool_marker not in s:
    raise SystemExit("contextual_pool insertion marker not found")
s=s.replace(pool_marker,pool_repl,1)

marker='def initial_subject_hint(section, source_text):\n'
if marker not in s:
    raise SystemExit("initial_subject_hint marker not found")

helper=r'''def detect_subject_switch(phrase, current_hint=None):
    """Track the grammatical subject without letting comparison objects steal it."""
    t=(phrase or "").strip()
    if not t:
        return current_hint

    # A summary of SSD/HDD role assignment returns to a both-sides context.
    if "使い分け" in t:
        return "BOTH"

    comparison_objects=(
        "HDDと同じように", "SSDと同じように",
        "HDDのように", "SSDのように", "HDDのような", "SSDのような",
        "HDDと同様", "SSDと同様",
        "HDDに比べ", "SSDに比べ", "HDDと比べ", "SSDと比べ",
        "HDDより", "SSDより",
        "HDDとの差", "SSDとの差",
        "HDDと比較", "SSDと比較",
    )
    for x in comparison_objects:
        if x in t:
            xp=t.find(x)
            prefix=t[:xp]
            if any(k in prefix for k in ["SSDは","SSDでは","SSDには","SSDが","SSDでも","SSDへ","SSDの方"]):
                return "SSD"
            if any(k in prefix for k in ["HDDは","HDDでは","HDDには","HDDが","HDDでも","HDDへ","HDDの方"]):
                return "HDD"
            return current_hint

    has_hdd="HDD" in t
    has_ssd="SSD" in t

    if has_hdd and has_ssd and any(k in t for k in ["比べ", "比較", "違い", "どちら", "どっち", "両方", "vs", "VS"]):
        return "BOTH"

    patterns={
        "SSD":[
            "SSDは", "SSDでは", "SSDには", "SSDが", "SSDでも", "SSDへ",
            "SSDの場合", "SSDなら", "一方SSD", "対してSSD", "それに対してSSD",
            "SSD側", "SSDの中", "SSDの方", "SSDだから", "SSDならば",
        ],
        "HDD":[
            "HDDは", "HDDでは", "HDDには", "HDDが", "HDDでも", "HDDへ",
            "HDDの場合", "HDDなら", "一方HDD", "対してHDD", "それに対してHDD",
            "HDD側", "HDDの中", "HDDの方", "HDDだから", "HDDならば",
        ],
    }
    candidates=[]
    for subject,needles in patterns.items():
        for x in needles:
            pos=t.find(x)
            if pos>=0:
                candidates.append((pos,subject))
    if candidates:
        return min(candidates,key=lambda x:x[0])[1]

    if has_ssd and not has_hdd:
        return "SSD"
    if has_hdd and not has_ssd:
        return "HDD"
    if t.startswith("SSD"):
        return "SSD"
    if t.startswith("HDD"):
        return "HDD"
    return current_hint

'''

s=s.replace(marker,helper+marker,1)

old_initial='''def initial_subject_hint(section, source_text):\n    explicit=detect_subject(source_text)\n    if explicit in ("HDD","SSD"):\n        return explicit\n    # Pure HDD/SSD mechanism chapters keep their subject even when a sentence\n    # omits the acronym ("円盤", "読み取り部分", "この仕組み" etc.).\n    if "HDDとは" in section:\n        return "HDD"\n    if "SSDとは" in section:\n        return "SSD"\n    return None\n'''
new_initial='''def initial_subject_hint(section, source_text):\n    t=(source_text or "").strip()\n    explicit=detect_subject(t)\n    if explicit in ("HDD","SSD"):\n        return explicit\n\n    if explicit=="BOTH":\n        grouped=("SSDとHDD", "HDDとSSD", "SSDやHDD", "HDDやSSD",\n                 "SSD・HDD", "HDD・SSD", "SSDにもHDDにも", "HDDにもSSDにも")\n        if any(t.startswith(x) for x in grouped):\n            return "BOTH"\n\n        markers={\n            "SSD":["SSDは","SSDでは","SSDには","SSDが","SSDでも","SSDの場合",\n                   "SSDなら","一方SSD","SSDの中","SSDの方","SSDだから"],\n            "HDD":["HDDは","HDDでは","HDDには","HDDが","HDDでも","HDDの場合",\n                   "HDDなら","一方HDD","HDDの中","HDDの方","HDDだから"],\n        }\n        hits=[]\n        for subject,needles in markers.items():\n            for x in needles:\n                pos=t.find(x)\n                if pos>=0:\n                    hits.append((pos,subject))\n        if hits:\n            pos,subject=min(hits,key=lambda x:x[0])\n            if pos<=14:\n                return subject\n\n        first=[]\n        for subject in ("SSD","HDD"):\n            pos=t.find(subject)\n            if pos>=0:\n                first.append((pos,subject))\n        if first:\n            pos,subject=min(first,key=lambda x:x[0])\n            if pos<=8:\n                return subject\n        return None\n\n    if "HDDとは" in section:\n        return "HDD"\n    if "SSDとは" in section:\n        return "SSD"\n    return None\n'''
if old_initial not in s:
    raise SystemExit("initial_subject_hint block not found")
s=s.replace(old_initial,new_initial,1)

old_sentence='''    sentence_hint=initial_subject_hint(row["section"],row["text"])\n    if sentence_hint in ("HDD","SSD"):\n        running_subject_hint=sentence_hint\n        subject_hint=sentence_hint\n    elif sentence_hint=="BOTH":\n        # A sentence can mention both sides later while its opening clause still\n        # refers to the previous sentence's subject. Keep the carried subject\n        # until a subtitle phrase explicitly switches it.\n        subject_hint=running_subject_hint\n    else:\n        subject_hint=running_subject_hint\n'''
new_sentence='''    sentence_hint=initial_subject_hint(row["section"],row["text"])\n    sentence_devices=detect_subject(row["text"])\n    if sentence_hint in ("HDD","SSD"):\n        running_subject_hint=sentence_hint\n        subject_hint=sentence_hint\n    elif sentence_hint=="BOTH":\n        subject_hint="BOTH"\n    elif sentence_devices=="BOTH":\n        subject_hint=None\n    else:\n        subject_hint=running_subject_hint\n'''
if old_sentence not in s:
    raise SystemExit("sentence subject initialization block not found")
s=s.replace(old_sentence,new_sentence,1)

old='''    for seg_i,seg in enumerate(timed_phrases(row)):\n        explicit_subject=detect_subject(seg["text"])\n        if explicit_subject in ("HDD","SSD"):\n            subject_hint=explicit_subject\n            running_subject_hint=explicit_subject\n        elif explicit_subject=="BOTH":\n            subject_hint="BOTH"\n'''
new='''    for seg_i,seg in enumerate(timed_phrases(row)):\n        explicit_subject=detect_subject(seg["text"])\n        switch_subject=detect_subject_switch(seg["text"], subject_hint)\n        if switch_subject in ("HDD","SSD"):\n            subject_hint=switch_subject\n            running_subject_hint=switch_subject\n        elif switch_subject=="BOTH":\n            subject_hint="BOTH"\n        elif explicit_subject=="BOTH":\n            subject_hint=subject_hint or running_subject_hint\n'''
if old not in s:
    raise SystemExit("event subject-tracking block not found")
s=s.replace(old,new,1)

p.write_text(s,encoding="utf-8")
print("subject tracking v3.2 patched")
