#!/usr/bin/env python3
from pathlib import Path

p=Path("tools/ssd_hdd_video/render_real_media.py")
s=p.read_text(encoding="utf-8")

marker='def initial_subject_hint(section, source_text):\n'
if marker not in s:
    raise SystemExit("initial_subject_hint marker not found")

helper=r'''def detect_subject_switch(phrase, current_hint=None):
    """Track the grammatical subject without letting comparison objects steal it.

    Examples:
      SSDは... / SSDでは... / SSDへ... => SSD
      HDDは... / HDDでも... / HDDへ... => HDD
      HDDと同じように... / HDDとの差... => keep current subject
      SSDとHDDを比べる... => BOTH
    """
    t=(phrase or "").strip()
    if not t:
        return current_hint

    # Phrases that mention the other device only as a comparison/reference.
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
            # If the same phrase has a clear topic before the comparison object,
            # that topic still wins (e.g. "SSDでは、HDDとの差が...").
            xp=t.find(x)
            prefix=t[:xp]
            if any(k in prefix for k in ["SSDは","SSDでは","SSDには","SSDが","SSDでも","SSDへ","SSDの方"]):
                return "SSD"
            if any(k in prefix for k in ["HDDは","HDDでは","HDDには","HDDが","HDDでも","HDDへ","HDDの方"]):
                return "HDD"
            return current_hint

    has_hdd="HDD" in t
    has_ssd="SSD" in t

    # Explicit symmetric comparison.
    if has_hdd and has_ssd and any(k in t for k in ["比べ", "比較", "違い", "どちら", "どっち", "vs", "VS"]):
        return "BOTH"

    # Strong grammatical topic markers. Choose the one that occurs first,
    # rather than hard-coding SSD-before-HDD.
    patterns={
        "SSD":[
            "SSDは", "SSDでは", "SSDには", "SSDが", "SSDでも", "SSDへ",
            "SSDの場合", "SSDなら", "一方SSD", "対してSSD", "それに対してSSD",
            "SSD側", "SSDの中", "SSDの方",
        ],
        "HDD":[
            "HDDは", "HDDでは", "HDDには", "HDDが", "HDDでも", "HDDへ",
            "HDDの場合", "HDDなら", "一方HDD", "対してHDD", "それに対してHDD",
            "HDD側", "HDDの中", "HDDの方",
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

    # If only one device is mentioned and it is not merely a comparison object,
    # the phrase is locally about that device.
    if has_ssd and not has_hdd:
        return "SSD"
    if has_hdd and not has_ssd:
        return "HDD"

    # A phrase beginning directly with one acronym is a local switch.
    if t.startswith("SSD"):
        return "SSD"
    if t.startswith("HDD"):
        return "HDD"

    return current_hint

'''

s=s.replace(marker,helper+marker,1)

# Replace sentence-level initial subject inference. Mixed SSD/HDD sentences no
# longer inherit the previous sentence blindly. Only a clearly early topic
# marker seeds the sentence; otherwise the sentence starts neutral until a
# subtitle phrase explicitly names its device.
old_initial='''def initial_subject_hint(section, source_text):\n    explicit=detect_subject(source_text)\n    if explicit in ("HDD","SSD"):\n        return explicit\n    # Pure HDD/SSD mechanism chapters keep their subject even when a sentence\n    # omits the acronym ("円盤", "読み取り部分", "この仕組み" etc.).\n    if "HDDとは" in section:\n        return "HDD"\n    if "SSDとは" in section:\n        return "SSD"\n    return None\n'''
new_initial='''def initial_subject_hint(section, source_text):\n    t=(source_text or "").strip()\n    explicit=detect_subject(t)\n    if explicit in ("HDD","SSD"):\n        return explicit\n\n    if explicit=="BOTH":\n        # Symmetric group openings are genuinely about both sides.\n        grouped=("SSDとHDD", "HDDとSSD", "SSDやHDD", "HDDやSSD",\n                 "SSD・HDD", "HDD・SSD", "SSDにもHDDにも", "HDDにもSSDにも")\n        if any(t.startswith(x) for x in grouped):\n            return "BOTH"\n\n        # If the sentence opens with a clear topic marker, seed that subject.\n        # A device first mentioned much later (e.g. Windows...はSSDへ...) does\n        # not control the earlier generic clause.\n        markers={\n            "SSD":["SSDは","SSDでは","SSDには","SSDが","SSDでも","SSDの場合",\n                   "SSDなら","一方SSD","SSDの中","SSDの方"],\n            "HDD":["HDDは","HDDでは","HDDには","HDDが","HDDでも","HDDの場合",\n                   "HDDなら","一方HDD","HDDの中","HDDの方"],\n        }\n        hits=[]\n        for subject,needles in markers.items():\n            for x in needles:\n                pos=t.find(x)\n                if pos>=0:\n                    hits.append((pos,subject))\n        if hits:\n            pos,subject=min(hits,key=lambda x:x[0])\n            if pos<=14:\n                return subject\n\n        # Direct early mention also seeds the sentence when it is not a grouped\n        # SSD/HDD construction.\n        first=[]\n        for subject in ("SSD","HDD"):\n            pos=t.find(subject)\n            if pos>=0:\n                first.append((pos,subject))\n        if first:\n            pos,subject=min(first,key=lambda x:x[0])\n            if pos<=8:\n                return subject\n\n        return None\n\n    # Pure mechanism chapters keep their subject even when a sentence omits\n    # the acronym ("円盤", "読み取り部分", "この仕組み" etc.).\n    if "HDDとは" in section:\n        return "HDD"\n    if "SSDとは" in section:\n        return "SSD"\n    return None\n'''
if old_initial not in s:
    raise SystemExit("initial_subject_hint block not found")
s=s.replace(old_initial,new_initial,1)

old_sentence='''    sentence_hint=initial_subject_hint(row["section"],row["text"])\n    if sentence_hint in ("HDD","SSD"):\n        running_subject_hint=sentence_hint\n        subject_hint=sentence_hint\n    elif sentence_hint=="BOTH":\n        # A sentence can mention both sides later while its opening clause still\n        # refers to the previous sentence's subject. Keep the carried subject\n        # until a subtitle phrase explicitly switches it.\n        subject_hint=running_subject_hint\n    else:\n        subject_hint=running_subject_hint\n'''
new_sentence='''    sentence_hint=initial_subject_hint(row["section"],row["text"])\n    sentence_devices=detect_subject(row["text"])\n    if sentence_hint in ("HDD","SSD"):\n        running_subject_hint=sentence_hint\n        subject_hint=sentence_hint\n    elif sentence_hint=="BOTH":\n        subject_hint="BOTH"\n    elif sentence_devices=="BOTH":\n        # Mixed sentence with no clear early grammatical topic: start neutral\n        # instead of leaking the previous sentence's subject into its first clause.\n        subject_hint=None\n    else:\n        subject_hint=running_subject_hint\n'''
if old_sentence not in s:
    raise SystemExit("sentence subject initialization block not found")
s=s.replace(old_sentence,new_sentence,1)

old='''    for seg_i,seg in enumerate(timed_phrases(row)):\n        explicit_subject=detect_subject(seg["text"])\n        if explicit_subject in ("HDD","SSD"):\n            subject_hint=explicit_subject\n            running_subject_hint=explicit_subject\n        elif explicit_subject=="BOTH":\n            subject_hint="BOTH"\n'''
new='''    for seg_i,seg in enumerate(timed_phrases(row)):\n        explicit_subject=detect_subject(seg["text"])\n        switch_subject=detect_subject_switch(seg["text"], subject_hint)\n        if switch_subject in ("HDD","SSD"):\n            subject_hint=switch_subject\n            running_subject_hint=switch_subject\n        elif switch_subject=="BOTH":\n            subject_hint="BOTH"\n        elif explicit_subject=="BOTH":\n            subject_hint=subject_hint or running_subject_hint\n'''
if old not in s:
    raise SystemExit("event subject-tracking block not found")
s=s.replace(old,new,1)

p.write_text(s,encoding="utf-8")
print("subject tracking v3 patched")
