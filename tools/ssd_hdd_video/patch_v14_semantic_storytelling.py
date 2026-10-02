#!/usr/bin/env python3
from pathlib import Path

P=Path('tools/ssd_hdd_video/render_real_media.py')
s=P.read_text(encoding='utf-8')

# -----------------------------------------------------------------------------
# V14: narration-sentence subject tracking.
# A device mentioned in the PREVIOUS sentence must never leak into a new sentence.
# Subject carry is allowed only inside the same narration sentence.
# -----------------------------------------------------------------------------
old='''events=[]; n=0; last_asset=None; recent_assets=[]; cur=0.0
running_subject_hint=None
last_subject_section=None
for row in rows:
    if row["section"] != last_subject_section:
        running_subject_hint=None
        last_subject_section=row["section"]
'''
new='''events=[]; n=0; last_asset=None; recent_assets=[]; cur=0.0
last_subject_section=None
for row in rows:
    if row["section"] != last_subject_section:
        last_subject_section=row["section"]
'''
if old not in s:
    raise SystemExit('V14 event-loop header target not found')
s=s.replace(old,new,1)

# subject_tracking_v2.py is currently v3.2. Replace its sentence initialization
# and phrase-switch block with sentence-local state only.
old='''    used_in_sentence=set()
    sentence_hint=initial_subject_hint(row["section"],row["text"])
    sentence_devices=detect_subject(row["text"])
    if sentence_hint in ("HDD","SSD"):
        running_subject_hint=sentence_hint
        subject_hint=sentence_hint
    elif sentence_hint=="BOTH":
        subject_hint="BOTH"
    elif sentence_devices=="BOTH":
        subject_hint=None
    else:
        subject_hint=running_subject_hint

    for seg_i,seg in enumerate(timed_phrases(row)):
        explicit_subject=detect_subject(seg["text"])
        switch_subject=detect_subject_switch(seg["text"], subject_hint)
        if switch_subject in ("HDD","SSD"):
            subject_hint=switch_subject
            running_subject_hint=switch_subject
        elif switch_subject=="BOTH":
            subject_hint="BOTH"
        elif explicit_subject=="BOTH":
            subject_hint=subject_hint or running_subject_hint
'''
new='''    used_in_sentence=set()
    sentence_hint=initial_subject_hint(row["section"],row["text"])
    # V14: reset at EVERY narration sentence. The prior sentence must not turn
    # a later RAM/Windows/browser/backup sentence into HDD/SSD imagery.
    if sentence_hint in ("HDD","SSD"):
        subject_hint=sentence_hint
    else:
        # BOTH starts neutral. Subtitle phrases switch the active subject only
        # when that current sentence actually names a device.
        subject_hint=None

    for seg_i,seg in enumerate(timed_phrases(row)):
        explicit_subject=detect_subject(seg["text"])
        switch_subject=detect_subject_switch(seg["text"], subject_hint)
        if switch_subject in ("HDD","SSD"):
            subject_hint=switch_subject
        elif switch_subject=="BOTH":
            subject_hint="BOTH"
        elif explicit_subject=="BOTH":
            subject_hint=subject_hint
'''
if old not in s:
    raise SystemExit('V14 subject-tracking v3.2 block not found')
s=s.replace(old,new,1)

# -----------------------------------------------------------------------------
# V14: concept-first media locks.
# These run BEFORE broad HDD/SSD subject pools. If the current phrase is about
# RAM, browser/apps, backup, external drives, or laptops, show that concept.
# -----------------------------------------------------------------------------
needle='''    phrase_subject=detect_subject(phrase)
    effective=phrase_subject or subject_hint
'''
insert='''    phrase_subject=detect_subject(phrase)
    local_subject=phrase_subject or subject_hint

    # RAM / memory explanation. If the phrase itself does not explicitly name
    # one storage device, show RAM/PC context rather than a leftover HDD/SSD cue.
    if phrase_subject is None and any(k in phrase for k in ["RAM","メモリ"]):
        return ["ram_ddr4","pc_m2_hdd_inside","motherboard","m2_installed"]

    # Browser / application / Windows / game examples should look like a PC use
    # case, not an HDD head close-up or NAS product shot.
    if phrase_subject is None and "ブラウザ" in phrase:
        return ["browser_demo_video","pc_m2_hdd_inside","m2_installed","laptop_nvme","nvme_m2","sata_ssd"]
    if phrase_subject is None and any(k in phrase for k in ["Windows","アプリ","ゲーム","編集ソフト"]):
        return ["pc_m2_hdd_inside","m2_installed","laptop_nvme","nvme_m2","sata_ssd","crucial_ssd","motherboard","ssd_install"]

    # Backup chapter: generic backup narration should show actual backup/NAS/
    # external-drive context. Explicit HDD/SSD phrases still use their device.
    if phrase_subject is None and (
        "バックアップ" in section or
        any(k in phrase for k in ["3-2-1","コピー","別の場所","クラウド","一台が壊","データが残る状態"])
    ):
        return ["nas","nas_drive_bay","external_hdds","external_hdd_laptop","server_rack","pc_m2_hdd_inside","hdd_ssd_disassembled"]

    # External/USB use cases. Preserve the SAME-SENTENCE device context: in a
    # sentence about an external SSD, a following clause that only says USB is
    # still an external-SSD visual, never an HDD by accident.
    if any(k in phrase for k in ["USB","外付け"]):
        if local_subject=="SSD":
            return ["external_ssd","sata_ssd","nvme_m2"]
        if local_subject=="HDD":
            return ["external_hdds","external_hdd_laptop","hdd_side"]
        return ["external_ssd","external_hdds","external_hdd_laptop","sata_ssd","hdd_side"]

    # Laptop/small-PC use case. Show the actual installation/form-factor context.
    if phrase_subject is None and any(k in phrase for k in ["ノートパソコン","ノートPC","小型PC","薄いノート"]):
        return ["laptop_nvme","m2_installed","nvme_m2","ssd_install","pc_m2_hdd_inside"]

    effective=phrase_subject or subject_hint
'''
if needle not in s:
    raise SystemExit('V14 contextual-pool insertion target not found')
s=s.replace(needle,insert,1)

# -----------------------------------------------------------------------------
# V14: strengthen semantic_asset_ok with the same concept-first restrictions.
# This ensures later rebalancing/near-repeat repair cannot silently reintroduce
# unrelated visuals after contextual_pool chose a correct asset.
# -----------------------------------------------------------------------------
needle='''def semantic_asset_ok(text, asset_id, source_text=None, section=None, subject_hint=None):
    combined = (text or "") + " " + (source_text or "")
'''
insert='''def semantic_asset_ok(text, asset_id, source_text=None, section=None, subject_hint=None):
    combined = (text or "") + " " + (source_text or "")
    explicit=detect_subject(text or "")
    local_subject=explicit or subject_hint

    if explicit is None and any(k in (text or "") for k in ["RAM","メモリ"]):
        return asset_id in {"ram_ddr4","pc_m2_hdd_inside","motherboard","m2_installed"}

    if explicit is None and "ブラウザ" in (text or ""):
        return asset_id in {"browser_demo_video","pc_m2_hdd_inside","m2_installed","laptop_nvme","nvme_m2","sata_ssd"}

    if explicit is None and any(k in (text or "") for k in ["Windows","アプリ","ゲーム","編集ソフト"]):
        return asset_id in {"pc_m2_hdd_inside","m2_installed","laptop_nvme","nvme_m2","sata_ssd","crucial_ssd","motherboard","ssd_install"}

    if explicit is None and (
        (section and "バックアップ" in section) or
        any(k in (text or "") for k in ["3-2-1","コピー","別の場所","クラウド","一台が壊","データが残る状態"])
    ):
        return asset_id in {"nas","nas_drive_bay","external_hdds","external_hdd_laptop","server_rack","pc_m2_hdd_inside","hdd_ssd_disassembled","backup_diagram"}

    if any(k in (text or "") for k in ["USB","外付け"]):
        if local_subject=="SSD":
            return asset_id in {"external_ssd","sata_ssd","nvme_m2"}
        if local_subject=="HDD":
            return asset_id in {"external_hdds","external_hdd_laptop","hdd_side"}
        if local_subject in (None,"BOTH"):
            return asset_id in {"external_ssd","external_hdds","external_hdd_laptop","sata_ssd","hdd_side"}

    if explicit is None and any(k in (text or "") for k in ["ノートパソコン","ノートPC","小型PC","薄いノート"]):
        return asset_id in {"laptop_nvme","m2_installed","nvme_m2","ssd_install","pc_m2_hdd_inside"}
'''
if needle not in s:
    raise SystemExit('V14 semantic_asset_ok insertion target not found')
s=s.replace(needle,insert,1)

P.write_text(s,encoding='utf-8')
print('V14 semantic storytelling patch applied: sentence reset + concept-first real media locks')
