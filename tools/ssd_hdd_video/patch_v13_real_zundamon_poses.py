#!/usr/bin/env python3
from pathlib import Path

P=Path('tools/ssd_hdd_video/render_real_media.py')
s=P.read_text(encoding='utf-8')

start=s.find('def prepare_zundamon_poses(src):')
end=s.find('\ndef _fit_photo',start)
if start<0 or end<0:
    raise SystemExit('V13 Zundamon pose replacement target not found; apply patch_v82_visuals.py first')

new='''def prepare_zundamon_poses(src=None):
    """Load genuine, separately-composited Zundamon 2.3 poses.

    V13 deliberately refuses mirror/tilt presentation variants. Every returned
    pose must be a different layer composition from the original Sakamoto Ahiru
    v2.3 standing-art material.
    """
    import hashlib
    pose_dir=Path("zundamon_poses")
    ordered=[
        pose_dir/"zundamon_normal.png",
        pose_dir/"zundamon_explain.png",
        pose_dir/"zundamon_question.png",
        pose_dir/"zundamon_attention.png",
    ]
    missing=[str(p) for p in ordered if not p.exists()]
    if missing:
        raise RuntimeError("Missing genuine Zundamon V13 poses: "+repr(missing))

    hashes=[]
    poses=[]
    for p in ordered:
        im=Image.open(p).convert("RGBA")
        ab=im.getchannel("A").getbbox()
        if not ab:
            raise RuntimeError(f"Zundamon pose has no alpha content: {p}")
        if im.height < 800 or im.width < 300:
            raise RuntimeError(f"Zundamon pose appears incomplete: {p} {im.size}")
        hashes.append(hashlib.sha256(p.read_bytes()).hexdigest())
        poses.append(p)
    if len(set(hashes)) != len(poses):
        raise RuntimeError("V13 Zundamon poses are not genuinely distinct")

    (OUT/"zundamon_pose_count.txt").write_text(str(len(poses))+"\\n",encoding="utf-8")
    manifest=pose_dir/"manifest.json"
    if manifest.exists():
        (OUT/"zundamon_pose_manifest.json").write_text(manifest.read_text(encoding="utf-8"),encoding="utf-8")
    return poses


def choose_zundamon_pose(poses,event_no,text,section):
    # 0 normal, 1 explain/point, 2 question/thinking, 3 attention/caveat.
    question=("？","?","どうして","なぜ","じゃあ","どっち","違う？","とは？")
    attention=("注意","ただし","故障","寿命","TBW","バックアップ","3-2-1","重要","誤解","ではない","限らない","注意点")
    explain=("プラッタ","ヘッド","NAND","コントローラー","M.2","NVMe","SATA","CMR","SMR","RPM","シーケンシャル","ランダム","容量","価格","仕組み")

    if any(k in text for k in question):
        return poses[2]
    if "バックアップ" in section or "寿命" in section or any(k in text for k in attention):
        return poses[3]
    if any(k in text for k in explain):
        return poses[1]
    return poses[0]
'''

s=s[:start]+new+s[end:]
s=s.replace('zundamon_poses=prepare_zundamon_poses(asset("zundamon_official"))',
            'zundamon_poses=prepare_zundamon_poses(None)')

P.write_text(s,encoding='utf-8')
print('V13 genuine Zundamon 2.3 poses patched; mirror/tilt variants disabled')
