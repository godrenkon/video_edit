#!/usr/bin/env python3
from __future__ import annotations
from pathlib import Path

P=Path("tools/ssd_hdd_video/render_real_media.py")
src=P.read_text(encoding="utf-8")

if "def finalize_visual_semantics_v7(" in src:
    print("V7 semantic specificity finalizer already present")
    raise SystemExit(0)

marker="\ndef finalize_no_near_repeats(events, distance=2, passes=48):\n"
if marker not in src:
    raise SystemExit("V7 requires V6 finalizer to be applied first")

func=r'''

def finalize_visual_semantics_v7(events):
    """Last semantic-specificity pass for explanatory visuals.

    Generic semantic QA can still allow technically-related but pedagogically
    weak B-roll (for example an NVMe close-up while explaining 3-2-1 backup).
    This pass narrows high-value phrases to better real-media choices without
    rewriting the original grammatical subject. Every replacement must pass the
    same semantic_asset_ok() predicate used by the rest of the renderer.
    V6 runs immediately afterwards to restore spacing if any replacement creates
    an A-B-A pattern.
    """
    events=[dict(e) for e in events]
    counts={}
    for e in events:
        counts[e["asset"]]=counts.get(e["asset"],0)+1

    HDD_MECH=["hdd_working_video","hdd_open_photo","hdd_head_macro","laptop_hdd_open","hdd_side"]
    HDD_CAPACITY=["external_hdds","external_hdd_laptop","nas","nas_drive_bay","server_rack","hdd_side","laptop_hdd_open"]
    SSD_DEVICE=["sata_ssd","crucial_ssd","nvme_m2","laptop_nvme","m2_installed","external_ssd","ssd_controller","ssd_nand"]
    SSD_ACTIVE=["nvme_m2","laptop_nvme","m2_installed","sata_ssd","crucial_ssd","ssd_install","external_ssd"]
    MIXED=["hdd_ssd_disassembled","pc_m2_hdd_inside","sata_vs_nvme","motherboard","computer_components_video"]
    BACKUP=["nas","nas_drive_bay","external_hdds","external_hdd_laptop","server_rack","pc_m2_hdd_inside","hdd_ssd_disassembled"]
    ARCHIVE=["external_hdds","nas","nas_drive_bay","server_rack","hdd_side","external_hdd_laptop","hdd_ssd_disassembled"]

    def existing(pool):
        return [a for a in pool if optional_asset(a)]

    def sem_ok(idx,a):
        row=events[idx]["row"]
        return semantic_asset_ok(
            row.get("text") or "", a,
            row.get("source_text"), row.get("section"), row.get("subject_hint")
        )

    def allowed_pool(idx):
        row=events[idx]["row"]
        pool=contextual_pool(
            row.get("section", ""),
            row.get("text") or "",
            row.get("source_text"),
            row.get("subject_hint")
        )
        return [a for a in pool if optional_asset(a) and sem_ok(idx,a)]

    def choose(pool, idx):
        # Preferred candidates must also satisfy the renderer's canonical
        # semantic predicate. If our preferred pool is too narrow, fall back to
        # the canonical contextual pool instead of forcing a misleading shot.
        preferred=[a for a in existing(pool) if sem_ok(idx,a)]
        candidates=preferred or allowed_pool(idx)
        if not candidates:
            return None

        nearby=[
            events[j]["asset"]
            for j in range(max(0,idx-4),min(len(events),idx+5))
            if j!=idx
        ]
        # Prefer a candidate not already near this cut, then the globally less
        # used candidate. This keeps opening/final summaries visually balanced.
        candidates=sorted(
            _unique(candidates),
            key=lambda a:(nearby.count(a),counts.get(a,0),a)
        )
        return candidates[0]

    def set_asset(idx,pool):
        new=choose(pool,idx)
        if not new:
            return False
        old=events[idx]["asset"]
        events[idx]["asset"]=new
        counts[old]=counts.get(old,1)-1
        counts[new]=counts.get(new,0)+1
        return old!=new

    changed=0
    for i,e in enumerate(events):
        row=e["row"]
        section=row.get("section","")
        txt=(row.get("text") or "").strip()
        full=(row.get("source_text") or txt).strip()

        # HDD mechanism: show the actual platter/head/working HDD rather than a
        # generic NAS enclosure or another storage product.
        if section in ("第2章　HDDとは？","第4章　SSDとHDDは何が違う？","第8章　寿命と故障はどう違う？"):
            mech_keys=("ヘッド","プラッタ","回ってくる","回転して","回転音","カリカリ","モーター","回転機構","機械部品")
            if any(k in txt for k in mech_keys):
                changed += set_asset(i,HDD_MECH)
                continue

        # Comparison statements explicitly contrasting both technologies should
        # prefer a both-sides composition, but only if contextual semantics allow
        # it; otherwise choose the best canonical comparison shot.
        if section=="第4章　SSDとHDDは何が違う？" and any(k in txt for k in ("HDDのような機械的な回転音","可動部品があるかどうか")):
            changed += set_asset(i,MIXED + HDD_MECH + SSD_DEVICE)
            continue

        # Capacity/price: archive-scale examples should look like bulk storage,
        # not an SSD installation close-up. Price/choice principles should avoid
        # one-sided imagery where the canonical pool permits a mixed view.
        if section=="第7章　容量と価格はどう違う？":
            archive_keys=("何十本","何百本","編集前の素材","必要な容量","バックアップ","数TB","大容量HDD","大量に残したい","HDDへ保存")
            neutral_keys=("ストレージを買う","どれくらい保存","容量をいくら","価格は時期","固定価格","買う時点","容量あたりの価格")
            if any(k in txt for k in archive_keys):
                changed += set_asset(i,ARCHIVE)
                continue
            if any(k in txt for k in neutral_keys) and not ("SSD" in txt or "HDD" in txt):
                changed += set_asset(i,MIXED + ARCHIVE + SSD_DEVICE)
                continue

        # Lifespan sentences describing both failure models should be balanced.
        if section=="第8章　寿命と故障はどう違う？" and any(k in txt for k in ("SSDにもHDDにも","それぞれ違った故障要因","寿命や故障の違い","重要なのだ")):
            changed += set_asset(i,MIXED + HDD_MECH + SSD_DEVICE)
            continue

        # Backup chapter: only deliberate single-drive examples use one-sided
        # media. The backup explanation itself prefers NAS/external/server views.
        if section=="第9章　バックアップは必要":
            if "高性能なSSD一台" in txt:
                changed += set_asset(i,SSD_DEVICE)
                continue
            if "大容量HDD一台" in txt or ("しかない動画" in txt and row.get("subject_hint")=="HDD"):
                changed += set_asset(i,HDD_CAPACITY)
                continue
            backup_concepts=(
                "ストレージ一台だけ","SSDかHDDかを","バックアップに","別の場所","同じデータ",
                "3-2-1","合計3つ","2種類の保存先","一台が壊れても","データが残る状態",
                "本当に消したくない","重要なのは絶対に壊れない"
            )
            if any(k in txt for k in backup_concepts) or "バックアップ" in txt:
                changed += set_asset(i,BACKUP)
                continue

        # Final chapter: role assignment remains one-sided where appropriate,
        # while principles/conclusions prefer both technologies together.
        if section=="最終章　SSDとHDD、結局どっちを選ぶ？":
            if any(k in txt for k in ("Windowsやアプリ","ゲーム、現在作業","SSDへ置いて","全部SSD","SSDにする")):
                changed += set_asset(i,SSD_ACTIVE)
                continue
            if any(k in txt for k in ("写真や完成した動画","バックアップなど大量","HDDへ","大量保存が中心","HDDを多く")):
                changed += set_asset(i,ARCHIVE)
                continue
            principle_keys=(
                "SSDとHDD、結局","ここまで見てきた","SSDとHDDはどちらも","中で使っている仕組み",
                "どちらが完全に上","自分が何を保存","速度と容量","で選ぶ方","大切なのは",
                "SSDだから","HDDだから古い","名前だけで判断","それぞれの特徴","自分の用途",
                "選ぶことなのだ","ということで今回は","違いについて","解説してきた",
                "この動画が分かりやすかった","参考になった","高評価とチャンネル登録","よろしくお願いします",
                "それでは、また次の動画で","会おうなのだ"
            )
            if any(k in txt for k in principle_keys):
                changed += set_asset(i,MIXED + HDD_MECH + SSD_DEVICE)
                continue

        # Opening overview: use the canonical BOTH pool but balance HDD/SSD shots
        # instead of forcing unrelated motherboard footage.
        if section=="オープニング":
            overview_keys=("SSDとHDDの","SSDとかHDD","どこが違う","どっちを","SSDとHDDは、どちらも","大まかな役割","それぞれの仕組み")
            if any(k in txt for k in overview_keys):
                changed += set_asset(i,MIXED + HDD_MECH + SSD_DEVICE)
                continue

    for n,e in enumerate(events):
        e["n"]=n
    print("V7.1 semantic specificity adjusted",changed,"events")
    return events
'''

src=src.replace(marker,"\n"+func+marker.lstrip("\n"),1)

old='''events=finalize_no_near_repeats(events,distance=2)\n'''
new='''events=finalize_visual_semantics_v7(events)\nevents=finalize_no_near_repeats(events,distance=2)\n'''
if old not in src:
    raise SystemExit("V7 finalizer call marker not found")
src=src.replace(old,new,1)

P.write_text(src,encoding="utf-8")
print("Applied V7.1 explanatory semantic specificity finalizer")
