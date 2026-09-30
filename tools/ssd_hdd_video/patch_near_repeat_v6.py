#!/usr/bin/env python3
from __future__ import annotations
from pathlib import Path

P = Path("tools/ssd_hdd_video/render_real_media.py")
src = P.read_text(encoding="utf-8")

if "def finalize_no_near_repeats(" in src:
    print("V6 near-repeat finalizer already present")
    raise SystemExit(0)

marker = "\n\n# final 8 sec: actual hardware montage in 2-second cuts, then next-video title.\n"
if marker not in src:
    raise SystemExit("V6 insertion marker not found")

func = r'''

def finalize_no_near_repeats(events, distance=1, passes=48):
    """Final deterministic visual-spacing pass.

    This pass runs after coalescing/rebalancing and guarantees that the exact
    same asset is never shown in two *adjacent* cuts.  It intentionally allows
    A-B-A patterns: returning to the same controller/NAND/HDD visual after one
    intervening cut is often semantically correct in a technical explanation.

    The previous distance=2 invariant was too strict and could reject valid
    sequences such as controller -> NAND -> controller even when every shot was
    short and directly matched the narration.

    Every replacement still has to pass semantic_asset_ok, so visual variety
    never takes priority over explanatory correctness.
    """
    events=[dict(e) for e in events]
    if not events:
        return events

    def usage_counts():
        counts={}
        for e in events:
            counts[e["asset"]]=counts.get(e["asset"],0)+1
        return counts

    def media_pool(e):
        row=e["row"]
        phrase=row["text"]
        source=row.get("source_text") or phrase
        section=row.get("section","")
        hint=row.get("subject_hint")
        groups=[
            contextual_pool(section,phrase,source,hint),
            strong_media_for(phrase),
            strong_media_for(source),
            pool_for(section,phrase),
            pool_for(section,source),
            HDD_INTERNAL, SSD_INTERNAL, HDD_GENERAL, SSD_GENERAL,
            M2_MEDIA, SATA_MEDIA, NAS_MEDIA, EXTERNAL_MEDIA,
            RAM_MEDIA, PC_MEDIA, STORAGE_MEDIA, SPEED_MEDIA,
        ]
        return _unique([
            x for group in groups for x in group
            if optional_asset(x)
        ])

    def valid_for(e,a):
        row=e["row"]
        phrase=row["text"]
        source=row.get("source_text") or phrase
        return semantic_asset_ok(
            phrase,a,source,row.get("section"),row.get("subject_hint")
        )

    def replace_at(idx, conflict_i, counts):
        e=events[idx]
        old=e["asset"]
        pool=media_pool(e)

        # Only adjacent equality is forbidden.  Do not forbid the asset used
        # two cuts ago; A-B-A is allowed when it is the clearest explanation.
        forbidden=set()
        if idx>0:
            forbidden.add(events[idx-1]["asset"])
        if idx+1<len(events):
            forbidden.add(events[idx+1]["asset"])

        # Protect the actual adjacent conflict explicitly.
        if conflict_i>0 and conflict_i-1 != idx:
            forbidden.add(events[conflict_i-1]["asset"])
        if conflict_i < len(events) and conflict_i != idx:
            forbidden.add(events[conflict_i]["asset"])

        candidates=[a for a in pool if a!=old and a not in forbidden and valid_for(e,a)]
        if not candidates:
            return False

        local=[
            events[j]["asset"]
            for j in range(max(0,idx-6),min(len(events),idx+7))
            if j!=idx
        ]
        candidates.sort(key=lambda a:(counts.get(a,0),local.count(a),pool.index(a),a))
        new=candidates[0]
        e["asset"]=new
        counts[old]=counts.get(old,1)-1
        counts[new]=counts.get(new,0)+1
        return True

    for _pass in range(passes):
        counts=usage_counts()
        conflict=None
        for i in range(1,len(events)):
            if events[i]["asset"] == events[i-1]["asset"]:
                conflict=i
                break
        if conflict is None:
            break

        i=conflict
        repeated=events[i]["asset"]
        older=[i-1]

        # Prefer changing the current shot. If it is semantically constrained,
        # try the immediately previous duplicate. If neither can change, keep
        # the semantic match and fail loudly rather than substituting nonsense.
        targets=[i] + older
        changed=False
        for idx in targets:
            if replace_at(idx,i,counts):
                changed=True
                break

        if not changed:
            row=events[i]["row"]
            raise RuntimeError(
                "V6 cannot resolve adjacent repeat before rendering: "
                f"event={i} asset={repeated!r} text={row.get('text','')!r}"
            )
    else:
        raise RuntimeError("V6 adjacent-repeat repair exceeded pass limit")

    remaining=[]
    for i in range(1,len(events)):
        if events[i]["asset"] == events[i-1]["asset"]:
            remaining.append((i,events[i]["asset"],events[i]["row"].get("text","")))
    if remaining:
        raise RuntimeError("V6 adjacent-repeat invariant failed: "+repr(remaining[:20]))

    # Re-check semantics after every spacing replacement. This turns a visual
    # QA failure into a cheap pre-render failure rather than a 1-hour rerender.
    semantic_bad=[]
    for i,e in enumerate(events):
        if e["row"].get("section")=="次回":
            continue
        if not valid_for(e,e["asset"]):
            semantic_bad.append((i,e["asset"],e["row"].get("text","")))
    if semantic_bad:
        raise RuntimeError("V6 semantic mismatch after spacing repair: "+repr(semantic_bad[:20]))

    for n,e in enumerate(events):
        e["n"]=n
    print("V6 adjacent-spacing QA passed: events",len(events),"distance",distance)
    return events
'''

src = src.replace(marker, func + marker, 1)

old = '''events=coalesce_short_events(events,min_dur=0.95,max_dur=4.05)
events=repair_near_repeats(events,distance=2)
events=rebalance_global_usage(events,distance=3,passes=10)
events=repair_near_repeats(events,distance=2)
'''
new = '''events=coalesce_short_events(events,min_dur=0.95,max_dur=4.05)
events=repair_near_repeats(events,distance=2)
events=rebalance_global_usage(events,distance=3,passes=10)
events=repair_near_repeats(events,distance=2)
# V6 is the final mutation of the visual asset sequence. It guarantees only
# adjacent duplicates are removed. A-B-A is intentionally allowed when it is
# semantically correct and every shot remains short.
events=finalize_no_near_repeats(events,distance=1)
'''
if old not in src:
    raise SystemExit("V6 final-pass call marker not found")
src = src.replace(old,new,1)

P.write_text(src,encoding="utf-8")
print("Applied V6 adjacent-repeat finalizer")
