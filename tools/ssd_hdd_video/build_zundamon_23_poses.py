#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
from pathlib import Path
from urllib.parse import quote

import requests
from PIL import Image, ImageDraw, ImageFont

CANVAS=(1082,1650)
OUT=Path('zundamon_poses')
CACHE=Path('/tmp/zundamon23_layers')
OUT.mkdir(exist_ok=True)
CACHE.mkdir(parents=True,exist_ok=True)

REPO='Winnako155/Zundamon-Sprite-Editor'
COMMIT='3907b8331962b4694c5be73ad36aebaefb7337ea'
ROOT='android(HbuilderX)/res/zun2.3'
RAW=f'https://raw.githubusercontent.com/{REPO}/{COMMIT}/'
UA={'User-Agent':'Mozilla/5.0 SSD-HDD-video-build'}

# Coordinates come from the v2.3 name_mapping.txt included with the expanded layer set.
# The normal eye is not a single image: it is Normal whites + a pupil layer.
LAYERS={
    'tail': ('Tail-like thing.png',(578,555)),
    'body': ('Outfit 1/Usual clothes.png',(306,167)),
    'r_waist': ('Outfit 1/Right arm/Waist.png',(281,596)),
    'r_point': ('Outfit 1/Right arm/Pointing.png',(244,593)),
    'r_raise': ('Outfit 1/Right arm/Hand raised.png',(181,315)),
    'l_waist': ('Outfit 1/Left arm/Waist.png',(583,593)),
    'l_think': ('Outfit 1/Left arm/Thinking.png',(470,537)),
    'l_raise': ('Outfit 1/Left arm/Hand raised.png',(585,322)),
    'cheeks': ('Face Color/Cheeks.png',(363,433)),
    'eye_whites_normal': ('Eyes/Eye set/Normal whites.png',(366,351)),
    'eye_pupil_camera': ('Eyes/Eye set/Pupils/Camera gaze.png',(391,372)),
    'eyes_up': ('Eyes/Looking up 3.png',(367,348)),
    'eyes_half': ('Eyes/Half-closed eyes.png',(364,369)),
    'brow_normal': ('Eyebrows/Normal brows.png',(383,305)),
    'brow_troubled': ('Eyebrows/Troubled brows 1.png',(364,316)),
    'brow_raised': ('Eyebrows/Raised brows.png',(386,293)),
    'mouth_mufu': ('Mouth/Mufu.png',(466,496)),
    'mouth_o': ('Mouth/O.png',(480,487)),
    'mouth_nah': ('Mouth/Nah-.png',(460,482)),
    'edamame': ('Edamame/Edamame normal.png',(258,109)),
}

POSES={
    # Calm default used for ordinary explanation.
    'normal': ['tail','body','l_waist','r_waist','cheeks','eye_whites_normal','eye_pupil_camera','brow_normal','mouth_mufu','edamame'],
    # Right-hand pointing pose for mechanisms, terminology and key facts.
    'explain': ['tail','body','l_waist','r_point','cheeks','eye_whites_normal','eye_pupil_camera','brow_normal','mouth_o','edamame'],
    # Thinking pose for questions, comparisons and "why?" transitions.
    'question': ['tail','body','l_think','r_waist','cheeks','eyes_up','brow_troubled','mouth_mufu','edamame'],
    # Raised-hand / alert pose for caveats, lifetime, backup and misconceptions.
    'attention': ['tail','body','l_waist','r_raise','cheeks','eyes_half','brow_raised','mouth_nah','edamame'],
}

def raw_url(rel):
    return RAW + quote(f'{ROOT}/{rel}',safe='/')

def get_layer(key):
    rel,(x,y)=LAYERS[key]
    p=CACHE/(key+'.png')
    if not p.exists():
        url=raw_url(rel)
        r=requests.get(url,headers=UA,timeout=90)
        if r.status_code != 200:
            raise RuntimeError(f'layer download failed: key={key} status={r.status_code} url={url}')
        p.write_bytes(r.content)
    im=Image.open(p).convert('RGBA')
    return im,(x,y),rel

def build_pose(name,keys):
    canvas=Image.new('RGBA',CANVAS,(0,0,0,0))
    sources=[]
    for key in keys:
        layer,(x,y),rel=get_layer(key)
        canvas.alpha_composite(layer,(x,y))
        sources.append(rel)
    bbox=canvas.getchannel('A').getbbox()
    if not bbox:
        raise RuntimeError(f'pose {name}: empty alpha')
    margin=36
    l,t,r,b=bbox
    l=max(0,l-margin); t=max(0,t-margin); r=min(CANVAS[0],r+margin); b=min(CANVAS[1],b+margin)
    crop=canvas.crop((l,t,r,b))
    out=OUT/f'zundamon_{name}.png'
    crop.save(out)
    digest=hashlib.sha256(out.read_bytes()).hexdigest()
    return {
        'name':name,'file':out.name,'sha256':digest,
        'size':[crop.width,crop.height],'alpha_bbox':list(crop.getchannel('A').getbbox() or ()),
        'source_layers':sources,
    }

meta=[build_pose(name,keys) for name,keys in POSES.items()]
if len({x['sha256'] for x in meta}) != len(meta):
    raise RuntimeError('Zundamon poses are not genuinely distinct')
for x in meta:
    if x['size'][1] < 800 or x['size'][0] < 300:
        raise RuntimeError(f'pose too small or incomplete: {x}')

thumbs=[]
for x in meta:
    im=Image.open(OUT/x['file']).convert('RGBA')
    im.thumbnail((330,520),Image.Resampling.LANCZOS)
    thumbs.append((x['name'],im))
sheet=Image.new('RGBA',(420*len(thumbs),620),(28,32,36,255))
d=ImageDraw.Draw(sheet)
try:
    font=ImageFont.truetype('/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc',30)
except Exception:
    font=None
for i,(name,im) in enumerate(thumbs):
    x=420*i+(420-im.width)//2
    y=50+(520-im.height)
    sheet.alpha_composite(im,(x,y))
    d.text((420*i+210,585),name,fill=(235,255,235,255),font=font,anchor='mm')
sheet.save(OUT/'zundamon_pose_contact_sheet.png')

(OUT/'manifest.json').write_text(json.dumps({
    'source_repo':REPO,
    'source_commit':COMMIT,
    'original_material':'坂本アヒル ずんだもん立ち絵素材2.3 / im10788496',
    'poses':meta,
},ensure_ascii=False,indent=2),encoding='utf-8')

print(json.dumps(meta,ensure_ascii=False,indent=2))
