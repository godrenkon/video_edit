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

def finalize_no_near_repeats(events, distance=2, passes=48):
    """Final deterministic visual-spacing pass.

    Run this *after* coalescing and global rebalancing.  Earlier passes can
    legitimately change neighbouring shots and re-introduce A-B-A patterns.
    This pass guarantees there is no adjacent repeat and no reuse within the
    previous ``distance`` cuts before any expensive ffmpeg rendering starts.

    If the current event cannot be changed semantically, the older occurrence
    is changed instead.  Every replacement still has to pass
    ``semantic_asset_ok``.
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

        # Do not pick anything visible in the local spacing window.  For an
        # older occurrence, this includes the newer duplicate that caused the
        # conflict, so changing the old A in A-B-A truly resolves the loop.
        lo=max(0,idx-distance)
        hi=min(len(events),idx+distance+1)
        forbidden={events[j]["asset"] for j in range(lo,hi) if j!=idx}

        # Also protect the conflict neighbourhood explicitly; this matters at
        # the beginning/end of the timeline where the symmetric window is
        # smaller.
        for j in range(max(0,conflict_i-distance),min(len(events),conflict_i+2)):
            if j != idx:
                forbidden.add(events[j]["asset"])

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
        for i in range(len(events)):
            recent={events[j]["asset"] for j in range(max(0,i-distance),i)}
            if events[i]["asset"] in recent:
                conflict=i
                break
        if conflict is None:
            break

        i=conflict
        repeated=events[i]["asset"]
        older=[j for j in range(max(0,i-distance),i) if events[j]["asset"]==repeated]

        # Prefer changing the current shot.  If its phrase is semantically too
        # constrained, change the older duplicate instead.  This is the case
        # the previous repair pass did not guarantee.
        targets=[i] + list(reversed(older))
        changed=False
        for idx in targets:
            if replace_at(idx,i,counts):
                changed=True
                break

        if not changed:
            row=events[i]["row"]
            raise RuntimeError(
                "V6 cannot resolve near-repeat before rendering: "
                f"event={i} asset={repeated!r} text={row.get('text','')!r} "
                f"recent={[events[j]['asset'] for j in range(max(0,i-distance),i)]!r}"
            )
    else:
        raise RuntimeError("V6 near-repeat repair exceeded pass limit")

    remaining=[]
    for i,e in enumerate(events):
        recent={events[j]["asset"] for j in range(max(0,i-distance),i)}
        if e["asset"] in recent:
            remaining.append((i,e["asset"],sorted(recent),e["row"].get("text","")))
    if remaining:
        raise RuntimeError("V6 near-repeat invariant failed: "+repr(remaining[:20]))

    # Re-check semantics after every spacing replacement.  This turns a visual
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
    print("V6 spacing QA passed: events",len(events),"distance",distance)
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
# V6 must be the final mutation of the visual asset sequence.  It guarantees
# no adjacent or A-B-A reuse remains *after* coalescing/rebalancing.
events=finalize_no_near_repeats(events,distance=2)
'''
if old not in src:
    raise SystemExit("V6 final-pass call marker not found")
src = src.replace(old,new,1)

P.write_text(src,encoding="utf-8")
print("Applied V6 deterministic near-repeat finalizer")
