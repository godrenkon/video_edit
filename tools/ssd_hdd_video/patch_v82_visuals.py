#!/usr/bin/env python3
from pathlib import Path

P=Path('tools/ssd_hdd_video/render_real_media.py')
s=P.read_text(encoding='utf-8')

old='''def prepare_zundamon(src):
    """Extract one standing Zundamon pose from the official transparent image.

    Some official distribution images contain multiple poses side-by-side.
    The previous renderer cropped the whole alpha bbox, which could show two
    Zundamons at once. Detect large separated alpha groups and keep one pose.
    """
    im=Image.open(src).convert("RGBA")
    bbox=im.getchannel("A").getbbox()
    if bbox:
        im=im.crop(bbox)

    alpha=im.getchannel("A")
    w,h=im.size
    if w > 80:
        # Vertical alpha projection: transparent columns separate side-by-side poses.
        proj=alpha.resize((w,1),Image.Resampling.BOX)
        vals=list(proj.getdata())
        active=[v > 1 for v in vals]

        runs=[]
        start=None
        for x,on in enumerate(active+[False]):
            if on and start is None:
                start=x
            elif not on and start is not None:
                runs.append([start,x])
                start=None

        # Merge tiny internal gaps so hair/tail details do not split one pose.
        merged=[]
        max_gap=max(6,int(w*0.02))
        for a,b in runs:
            if merged and a-merged[-1][1] <= max_gap:
                merged[-1][1]=b
            else:
                merged.append([a,b])

        min_width=max(36,int(w*0.16))
        large=[r for r in merged if r[1]-r[0] >= min_width]
        if len(large) >= 2:
            # Prefer the pose carrying the most visible alpha pixels.
            def alpha_mass(r):
                a,b=r
                return sum(alpha.crop((a,0,b,h)).getdata())
            a,b=max(large,key=alpha_mass)
            margin=max(8,int(w*0.015))
            im=im.crop((max(0,a-margin),0,min(w,b+margin),h))
            bbox=im.getchannel("A").getbbox()
            if bbox:
                im=im.crop(bbox)

    pad=24
    canvas=Image.new("RGBA",(im.width+pad*2,im.height+pad*2),(0,0,0,0))
    canvas.alpha_composite(im,(pad,pad))
    out=WORK/"zundamon_cropped.png"
    canvas.save(out)
    return out
'''

new='''def prepare_zundamon_poses(src):
    """Extract all usable standing Zundamon poses from the official transparent sheet.

    V8.1 deliberately selected one pose only to prevent duplicate characters.
    V8.2 keeps every clearly separated large alpha group, so the character can
    change pose naturally without introducing unrelated generated art.
    """
    im=Image.open(src).convert("RGBA")
    bbox=im.getchannel("A").getbbox()
    if bbox:
        im=im.crop(bbox)

    alpha=im.getchannel("A")
    w,h=im.size
    groups=[]
    if w > 80:
        proj=alpha.resize((w,1),Image.Resampling.BOX)
        vals=list(proj.getdata())
        active=[v > 1 for v in vals]
        runs=[]; start=None
        for x,on in enumerate(active+[False]):
            if on and start is None:
                start=x
            elif not on and start is not None:
                runs.append([start,x]); start=None
        merged=[]
        max_gap=max(6,int(w*0.02))
        for a,b in runs:
            if merged and a-merged[-1][1] <= max_gap:
                merged[-1][1]=b
            else:
                merged.append([a,b])
        min_width=max(36,int(w*0.13))
        groups=[r for r in merged if r[1]-r[0] >= min_width]

    if not groups:
        groups=[[0,w]]

    poses=[]
    margin=max(8,int(w*0.015))
    for idx,(a,b) in enumerate(groups[:6]):
        pose=im.crop((max(0,a-margin),0,min(w,b+margin),h))
        pb=pose.getchannel("A").getbbox()
        if pb:
            pose=pose.crop(pb)
        if pose.width < 40 or pose.height < 100:
            continue
        pad=24
        canvas=Image.new("RGBA",(pose.width+pad*2,pose.height+pad*2),(0,0,0,0))
        canvas.alpha_composite(pose,(pad,pad))
        out=WORK/f"zundamon_pose_{idx:02d}.png"
        canvas.save(out)
        poses.append(out)

    if not poses:
        raise RuntimeError("No usable Zundamon pose extracted")
    (OUT/"zundamon_pose_count.txt").write_text(str(len(poses))+"\\n",encoding="utf-8")
    return poses

def choose_zundamon_pose(poses, event_no, text, section):
    if len(poses)==1:
        return poses[0]
    # Corrections/questions/summary points get a different pose where possible.
    hot=("？","?","≠","注意","つまり","ポイント","重要","どっち","結局")
    if any(k in text for k in hot):
        idx=1 % len(poses)
    elif "バックアップ" in section or "寿命" in section:
        idx=2 % len(poses)
    elif "最終" in section:
        idx=3 % len(poses)
    else:
        idx=(event_no//4) % len(poses)
    return poses[idx]
'''
if old not in s:
    raise SystemExit('prepare_zundamon block not found')
s=s.replace(old,new)

# Replace the global one-pose setup.
s=s.replace('zundamon=prepare_zundamon(asset("zundamon_official"))',
            'zundamon_poses=prepare_zundamon_poses(asset("zundamon_official"))')

# Render function chooses a pose per event.
s=s.replace('def render_event(ev,out,zundamon):', 'def render_event(ev,out,zundamon_poses):')
s=s.replace('    dur=ev["en"]-ev["st"]\n    text=ev["row"]["text"]',
'''    dur=ev["en"]-ev["st"]
    text=ev["row"]["text"]
    zundamon=choose_zundamon_pose(zundamon_poses,ev["n"],text,ev["row"]["section"])''')
s=s.replace('render_event(e,p,zundamon)', 'render_event(e,p,zundamon_poses)')

# Improve explanation overlays. These sit over real footage; they never replace it.
needle='''    elif "M.2" in t or "NVMe" in t:
        d.rounded_rectangle((70,180,600,345),radius=25,fill=(5,10,18,195))
        d.text((100,230),"M.2 ≠ NVMe",font=fb,fill=(141,255,113,255))
        d.text((100,292),"形状 と 通信規格",font=fs,fill=(255,255,255,255))
'''
replacement='''    elif "M.2" in t or "NVMe" in t:
        d.rounded_rectangle((70,165,735,405),radius=25,fill=(5,10,18,205))
        d.text((100,212),"M.2 ≠ NVMe",font=fb,fill=(141,255,113,255))
        small=ImageFont.truetype(FONT_BOLD,28)
        d.rounded_rectangle((105,270,310,345),radius=16,fill=(100,210,255,38),outline=(100,210,255,190),width=2)
        d.text((208,307),"M.2",font=fs,fill=(120,225,255,255),anchor="mm")
        d.text((350,307),"→",font=fb,fill=(255,255,255,220),anchor="mm")
        d.rounded_rectangle((395,250,690,300),radius=14,fill=(255,255,255,24),outline=(141,255,113,160),width=2)
        d.rounded_rectangle((395,325,690,375),radius=14,fill=(255,255,255,24),outline=(141,255,113,160),width=2)
        d.text((542,275),"SATA 接続",font=small,fill=(255,255,255,255),anchor="mm")
        d.text((542,350),"NVMe / PCIe",font=small,fill=(255,255,255,255),anchor="mm")
'''
if needle not in s:
    raise SystemExit('M.2 overlay block not found')
s=s.replace(needle,replacement)

needle='''    elif "3-2-1" in t or "バックアップ" in row["section"]:
        d.rounded_rectangle((70,180,690,360),radius=25,fill=(5,10,18,195))
        d.text((100,230),"3 - 2 - 1 BACKUP",font=fb,fill=(141,255,113,255))
        d.text((100,300),"3 copies   2 media   1 off-site",font=fs,fill=(255,255,255,255))
'''
replacement='''    elif "3-2-1" in t or "バックアップ" in row["section"]:
        d.rounded_rectangle((70,160,805,410),radius=25,fill=(5,10,18,205))
        d.text((100,208),"3 - 2 - 1 バックアップ",font=fb,fill=(141,255,113,255))
        labels=[("3","合計3コピー"),("2","2種類の保存先"),("1","1つは別の場所")]
        xs=[115,350,585]
        small=ImageFont.truetype(FONT_BOLD,24)
        for x,(num,label) in zip(xs,labels):
            d.rounded_rectangle((x,260,x+190,375),radius=20,fill=(255,255,255,24),outline=(141,255,113,150),width=2)
            d.text((x+95,292),num,font=fb,fill=(141,255,113,255),anchor="mm")
            d.text((x+95,343),label,font=small,fill=(255,255,255,255),anchor="mm")
'''
if needle not in s:
    raise SystemExit('backup overlay block not found')
s=s.replace(needle,replacement)

# Add a generic speed ladder before the M.2 branch. It is qualitative and does not
# claim that benchmark ratios equal real-world loading-time ratios.
anchor='''    elif "M.2" in t or "NVMe" in t:
'''
speed='''    elif any(k in t for k in ["アクセス速度","速度の差","速く","高速"] ) and any(k in row["section"] for k in ["速度","違う"]):
        d.rounded_rectangle((70,165,760,415),radius=25,fill=(5,10,18,205))
        d.text((100,212),"アクセス速度のイメージ",font=fb,fill=(141,255,113,255))
        bars=[("HDD",0.22,(255,185,80,255)),("SATA SSD",0.58,(100,210,255,255)),("NVMe SSD",0.92,(141,255,113,255))]
        yy=270
        small=ImageFont.truetype(FONT_BOLD,26)
        for label,val,col in bars:
            d.text((105,yy+18),label,font=small,fill=(255,255,255,255),anchor="lm")
            d.rounded_rectangle((285,yy,710,yy+36),radius=16,fill=(255,255,255,24))
            d.rounded_rectangle((285,yy,285+int(425*val),yy+36),radius=16,fill=col)
            yy+=58
        d.text((100,397),"※実際の差は製品・処理内容で変わる",font=ImageFont.truetype(FONT_BOLD,22),fill=(225,235,245,230))
'''
if anchor not in s:
    raise SystemExit('speed insert anchor not found')
s=s.replace(anchor,speed+anchor,1)

# Capacity/price explanation over relevant real-media shots.
anchor='''    elif "TBW" in t:
'''
cap='''    elif any(k in t for k in ["容量あたり","大容量","価格","1TB","2TB","4TB","8TB","16TB"]):
        d.rounded_rectangle((70,165,730,400),radius=25,fill=(5,10,18,205))
        d.text((100,212),"容量と価格の考え方",font=fb,fill=(141,255,113,255))
        small=ImageFont.truetype(FONT_BOLD,28)
        d.text((105,285),"速度を優先",font=small,fill=(120,225,255,255))
        d.text((355,285),"→ SSD",font=small,fill=(120,225,255,255))
        d.text((105,345),"大容量を安く",font=small,fill=(255,195,105,255))
        d.text((355,345),"→ HDD",font=small,fill=(255,195,105,255))
        d.text((540,315),"用途で使い分け",font=small,fill=(255,255,255,245),anchor="mm")
'''
if anchor not in s:
    raise SystemExit('capacity insert anchor not found')
s=s.replace(anchor,cap+anchor,1)

P.write_text(s,encoding='utf-8')
print('V8.2 visual patch applied')
