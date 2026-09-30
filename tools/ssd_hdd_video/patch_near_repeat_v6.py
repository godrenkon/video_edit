#!/usr/bin/env python3
from __future__ import annotations
from pathlib import Path

P = Path("tools/ssd_hdd_video/render_real_media.py")
src = P.read_text(encoding="utf-8")

marker = "\n\n# final 8 sec: actual hardware montage in 2-second cuts, then next-video title.\n"
if marker not in src:
    raise SystemExit("V6 insertion marker not found")

func = r'''

def finalize_no_near_repeats(events, distance=1, passes=48):
    """Final deterministic visual-spacing pass.

    Guarantee only that the exact same asset is never shown in two adjacent
    cuts. A-B-A is intentionally allowed when it is the clearest visual match
    for a technical explanation, for example controller -> NAND -> controller.
    Every replacement must still pass semantic_asset_ok.
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

        # Only direct adjacency is forbidden. Do not block the asset two cuts
        # ago; A-B-A is valid when narration returns to the same component.
        forbidden=set()
        if idx>0:
            forbidden.add(events[idx-1]["asset"])
        if idx+1<len(events):
            forbidden.add(events[idx+1]["asset"])
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
        changed=False
        for idx in (i,i-1):
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

# Idempotent function injection. Do not exit early: older renderers may already
# contain the function but still retain the obsolete A-B-A rejection QA below.
if "def finalize_no_near_repeats(" not in src:
    src = src.replace(marker, func + marker, 1)

# Align the final mutation pass with the actual hard QA: adjacent duplicates are
# forbidden, but A-B-A is allowed. Replace either the legacy block or the
# partially patched V6 block.
legacy = '''events=coalesce_short_events(events,min_dur=0.95,max_dur=4.05)
events=repair_near_repeats(events,distance=2)
events=rebalance_global_usage(events,distance=3,passes=10)
events=repair_near_repeats(events,distance=2)
'''
patched = '''events=coalesce_short_events(events,min_dur=0.95,max_dur=4.05)
events=repair_near_repeats(events,distance=1)
events=rebalance_global_usage(events,distance=3,passes=10)
events=repair_near_repeats(events,distance=1)
# V6 final mutation: adjacent A-A is forbidden; semantic A-B-A is allowed.
events=finalize_no_near_repeats(events,distance=1)
'''
if legacy in src:
    src = src.replace(legacy, patched, 1)
else:
    # Handle a renderer that already has the finalizer call but still uses
    # distance=2 repair passes.
    src = src.replace('events=repair_near_repeats(events,distance=2)',
                      'events=repair_near_repeats(events,distance=1)')
    call='events=finalize_no_near_repeats(events,distance=1)'
    if call not in src:
        anchor='events=rebalance_global_usage(events,distance=3,passes=10)\n'
        pos=src.find(anchor)
        if pos<0:
            raise SystemExit("V6 final-pass call marker not found")
        # Insert after the repair following rebalance if present, otherwise after rebalance.
        after=pos+len(anchor)
        next_repair='events=repair_near_repeats(events,distance=1)\n'
        if src.startswith(next_repair,after):
            after += len(next_repair)
        src = src[:after] + call + '\n' + src[after:]

# Remove the obsolete hard QA that rejected A-B-A patterns. The workflow-level
# V10 hard QA already checks the correct invariant: no adjacent identical asset.
old_near = '''near_repeat=[
    (events[i]["n"],events[i]["asset"])
    for i in range(len(events))
    if events[i]["asset"] in {x["asset"] for x in events[max(0,i-2):i]}
]
if near_repeat:
    raise RuntimeError("real-media asset reused within two previous cuts: "+repr(near_repeat[:20]))

'''
if old_near in src:
    src = src.replace(old_near,
        '# V6: A-B-A is permitted. Adjacent A-A is checked above and again in V10 hard QA.\n\n',1)

# Assert that the obsolete rule is really gone; fail cheaply before rendering.
if 'real-media asset reused within two previous cuts' in src:
    raise SystemExit('V6 obsolete A-B-A QA is still present')
if 'events=finalize_no_near_repeats(events,distance=1)' not in src:
    raise SystemExit('V6 finalizer call missing after patch')

P.write_text(src,encoding="utf-8")
print("Applied V6 adjacent-only repeat policy and removed obsolete A-B-A QA")
