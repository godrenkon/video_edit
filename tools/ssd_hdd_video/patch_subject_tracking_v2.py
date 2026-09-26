#!/usr/bin/env python3
from pathlib import Path

p=Path("tools/ssd_hdd_video/render_real_media.py")
s=p.read_text(encoding="utf-8")

marker='def initial_subject_hint(section, source_text):\n'
if marker not in s:
    raise SystemExit("initial_subject_hint marker not found")

helper=r'''def detect_subject_switch(phrase, current_hint=None):
    """Return a real subject switch, not a mere comparison mention.

    Examples:
      SSDは... / SSDでは... / 一方SSD... => SSD
      HDDは... / HDDでは... / 一方HDD... => HDD
      HDDと同じように... / SSDのように... => keep current subject
      SSDとHDDを比べる... => BOTH
    """
    t=(phrase or "").strip()
    if not t:
        return None

    # Explicit two-sided comparison.
    if (("SSD" in t and "HDD" in t) and
        any(k in t for k in ["比べ", "比較", "違い", "どちら", "どっち", "一方", "対して", "vs", "VS"])):
        return "BOTH"

    # Comparison objects do NOT steal the current subject.
    comparison_objects=(
        "HDDと同じように", "SSDと同じように",
        "HDDのように", "SSDのように",
        "HDDと同様", "SSDと同様",
        "HDDに比べ", "SSDに比べ",
        "HDDより", "SSDより",
    )
    if any(x in t for x in comparison_objects):
        positions=[(t.find("SSD"),"SSD"),(t.find("HDD"),"HDD")]
        positions=[x for x in positions if x[0] >= 0]
        if positions:
            first=min(positions)[1]
            if any(t.find(x) >= 0 and x.startswith(first) for x in comparison_objects):
                return current_hint

    # Strong grammatical subject/topic markers.
    patterns={
        "SSD":[
            "SSDは", "SSDでは", "SSDには", "SSDが", "SSDの場合", "SSDなら",
            "一方SSD", "対してSSD", "それに対してSSD", "SSD側", "SSDの中",
        ],
        "HDD":[
            "HDDは", "HDDでは", "HDDには", "HDDが", "HDDの場合", "HDDなら",
            "一方HDD", "対してHDD", "それに対してHDD", "HDD側", "HDDの中",
        ],
    }
    for subject, needles in patterns.items():
        if any(x in t for x in needles):
            return subject

    # If a phrase starts directly with the acronym and is not a comparison
    # object, treat it as the new local subject.
    for subject in ("SSD","HDD"):
        if t.startswith(subject):
            if not any(t.startswith(x) for x in comparison_objects):
                return subject

    return current_hint

'''

s=s.replace(marker,helper+marker,1)

old='''    for seg_i,seg in enumerate(timed_phrases(row)):\n        explicit_subject=detect_subject(seg["text"])\n        if explicit_subject in ("HDD","SSD"):\n            subject_hint=explicit_subject\n            running_subject_hint=explicit_subject\n        elif explicit_subject=="BOTH":\n            subject_hint="BOTH"\n'''
new='''    for seg_i,seg in enumerate(timed_phrases(row)):\n        explicit_subject=detect_subject(seg["text"])\n        switch_subject=detect_subject_switch(seg["text"], subject_hint)\n        if switch_subject in ("HDD","SSD"):\n            subject_hint=switch_subject\n            running_subject_hint=switch_subject\n        elif switch_subject=="BOTH":\n            subject_hint="BOTH"\n        elif explicit_subject=="BOTH":\n            # Merely mentioning both devices without comparison language does\n            # not discard the carried grammatical subject.\n            subject_hint=subject_hint or running_subject_hint\n'''
if old not in s:
    raise SystemExit("event subject-tracking block not found")
s=s.replace(old,new,1)

# The smoke/full workflows perform the semantic QA directly against storyboard.tsv.
# Keep this patch limited to subject-tracking behavior so it does not depend on
# the exact location/name of the renderer's coalescing step.

p.write_text(s,encoding="utf-8")
print("subject tracking v2 patched")
