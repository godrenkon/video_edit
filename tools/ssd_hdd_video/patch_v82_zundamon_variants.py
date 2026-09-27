#!/usr/bin/env python3
from pathlib import Path

P=Path('tools/ssd_hdd_video/render_real_media.py')
s=P.read_text(encoding='utf-8')

old='''    if not poses:
        raise RuntimeError("No usable Zundamon pose extracted")
    (OUT/"zundamon_pose_count.txt").write_text(str(len(poses))+"\\n",encoding="utf-8")
    return poses
'''

new='''    if not poses:
        raise RuntimeError("No usable Zundamon pose extracted")

    # The current official still image contains one actual pose. Do not pretend it
    # contains extra expressions. When only one pose exists, create presentation
    # variants from that exact official artwork so the character is not visually
    # frozen for twenty minutes: original, horizontally mirrored, and a tiny tilt.
    # These are layout variants, not new character poses/expressions.
    if len(poses)==1:
        base=Image.open(poses[0]).convert("RGBA")

        mirrored=base.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
        out_m=WORK/"zundamon_variant_mirror.png"
        mirrored.save(out_m)
        poses.append(out_m)

        tilted=base.rotate(2.2,resample=Image.Resampling.BICUBIC,expand=True)
        tb=tilted.getchannel("A").getbbox()
        if tb:
            tilted=tilted.crop(tb)
        pad=24
        canvas=Image.new("RGBA",(tilted.width+pad*2,tilted.height+pad*2),(0,0,0,0))
        canvas.alpha_composite(tilted,(pad,pad))
        out_t=WORK/"zundamon_variant_tilt.png"
        canvas.save(out_t)
        poses.append(out_t)

    (OUT/"zundamon_pose_count.txt").write_text(str(len(poses))+"\\n",encoding="utf-8")
    return poses
'''

if old not in s:
    raise SystemExit('zundamon fallback insertion target not found')
s=s.replace(old,new)
P.write_text(s,encoding='utf-8')
print('V8.2 Zundamon presentation variants patched')
