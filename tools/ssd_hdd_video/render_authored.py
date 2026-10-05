#!/usr/bin/env python3
"""Render the authored V16 explainer. Visual edits follow narration, never a timer.

Every sentence has a reviewed composition in authored_storyboard_v16.json.
Source hashes prevent silently reusing a storyboard with a different script.
Photos are contained, not stretched; Zundamon has a fixed baseline and scale.
"""
from __future__ import annotations
import argparse, csv, hashlib, io, json, math, re, subprocess
from functools import lru_cache
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageOps

W,H,FPS=1920,1080,60
ROOT=Path(__file__).resolve().parent
BG='#f4f7f5'; WHITE='#ffffff'; INK='#20312a'; GREEN='#21693f'; LINE='#d7e2da'
ORANGE='#ae6525'; BLUE='#216c8e'; LIGHT='#e9f2ec'
PHOTO_BOX=(72,240,1492,780)
CAPTION_BOX=(72,878,1848,1042)
CHARACTER_BOX=(1550,278,1848,846)

@lru_cache(maxsize=40)
def font(size):
    return ImageFont.truetype(str(FONT),size)

def text(im,xy,s,size=42,color=INK,anchor='la',max_width=None):
    d=ImageDraw.Draw(im)
    f=font(size)
    if max_width:
        while d.textlength(s,font=f)>max_width and size>28:
            size-=1;f=font(size)
        if d.textlength(s,font=f)>max_width:
            raise ValueError(f'Text will not fit: {s}')
    d.text(xy,s,font=f,fill=color,anchor=anchor)

def rect(im,box,fill=WHITE,outline=LINE,width=2):
    ImageDraw.Draw(im).rectangle(box,fill=fill,outline=outline,width=width)

def asset_path(asset_id):
    ps=sorted(p for p in ASSETS.glob(asset_id+'.*') if p.is_file())
    if len(ps)!=1: raise ValueError(f'Expected one source for {asset_id}: {ps}')
    return ps[0]

@lru_cache(maxsize=40)
def photo_source(asset_id):
    p=asset_path(asset_id)
    if p.suffix.lower() in ('.webm','.mp4','.mov'):
        p=OUT/'source_video_frame.png'
        if not p.exists():
            subprocess.run(['ffmpeg','-y','-loglevel','error','-ss','240','-i',str(asset_path(asset_id)),'-frames:v','1',str(p)],check=True)
    with Image.open(p) as src: return ImageOps.exif_transpose(src).convert('RGB')

def photo(im,asset_id,box,label='',crop=None):
    src=photo_source(asset_id)
    if crop:
        src=src.crop(tuple(round(c*(src.width if i%2==0 else src.height)) for i,c in enumerate(crop)))
    x0,y0,x1,y1=box
    rect(im,box)
    reserved=60 if label else 0
    pic=ImageOps.contain(src,(x1-x0-24,y1-y0-reserved-24),Image.Resampling.LANCZOS)
    x=x0+(x1-x0-pic.width)//2;y=y0+(y1-y0-reserved-pic.height)//2
    im.paste(pic,(x,y))
    if label: text(im,((x0+x1)//2,y1-30),label,34,GREEN,'mm',max_width=x1-x0-30)
    return (x,y,pic.width,pic.height)

def arrow(im,start,end,color=GREEN,width=6):
    d=ImageDraw.Draw(im);d.line((start,end),fill=color,width=width)
    angle=math.atan2(end[1]-start[1],end[0]-start[0]);length=20
    p1=(end[0]-length*math.cos(angle-.5),end[1]-length*math.sin(angle-.5))
    p2=(end[0]-length*math.cos(angle+.5),end[1]-length*math.sin(angle+.5))
    d.polygon((end,p1,p2),fill=color)

def file_icon(im,x,y,label):
    d=ImageDraw.Draw(im);d.polygon(((x,y),(x+66,y),(x+90,y+24),(x+90,y+106),(x,y+106)),fill=LIGHT,outline=GREEN)
    d.line(((x+66,y),(x+66,y+24),(x+90,y+24)),fill=GREEN,width=3)
    d.line((x+18,y+48,x+70,y+48),fill=GREEN,width=4);d.line((x+18,y+64,x+60,y+64),fill=GREEN,width=4)
    text(im,(x+45,y+133),label,30,INK,'mm')

def scene_base(s):
    im=Image.new('RGB',(W,H),BG)
    text(im,(72,46),'SSD / HDD',32,GREEN)
    text(im,(350,48),s['section'].split('　')[-1],30,INK,max_width=1140)
    ImageDraw.Draw(im).line((72,100,1848,100),fill=LINE,width=2)
    text(im,(72,134),s['title'],62,INK,max_width=1420)
    return im

def render_scene(s,path):
    im=scene_base(s);layout=s['layout'];a=s['assets'];notes=s['note'].split('／')
    if layout=='chapter':
        text(im,(760,432),s['section'].split('　')[0],54,GREEN,'mm')
        text(im,(760,540),s['section'].split('　')[-1],62,INK,'mm',max_width=1320)
        ImageDraw.Draw(im).line((400,630,1120,630),fill=GREEN,width=6)
    elif layout in ('intro','outro','pair','roles','ram','access','specspeed','lifetime','m2'):
        labels={'ram':('RAM：一時的な作業場所','SSD・HDD：データの保存場所'),
                'access':('HDD：機械部品が動く','SSD：電気的にアクセス'),
                'specspeed':('2.5インチ SATA SSD（外観例）','M.2 NVMe SSD（外観例）'),
                'intro':('SSD','HDD'),'outro':('SSD','HDD')}
        if layout=='m2':
            photo(im,a[0],(72,240,750,780),'M.2 SSDを取り付けた実物の例')
            for j,(title,detail) in enumerate((('M.2','物理的な形状の名前'),('NVMe','通信のための仕様'))):
                y=260+j*240;rect(im,(790,y,1492,y+210));text(im,(830,y+24),title,64,GREEN);text(im,(830,y+120),detail,42)
        else:
            ls=labels.get(layout,tuple(notes[:2]) if len(notes)>=2 and layout=='pair' else ('SSD','HDD'))
            if layout in ('roles','lifetime'):
                ls=('SSD','HDD')
            photo(im,a[0],(72,240,760,710),ls[0])
            photo(im,a[-1],(804,240,1492,710),ls[1])
            if layout=='roles':
                for j,n in enumerate(notes[:2]):text(im,(92+j*732,745),n.split('：',1)[-1],35,GREEN,max_width=650)
            elif layout=='specspeed':
                if s['source_index'] in (53,54):
                    text(im,(92,745),'例：500MB/s',46,GREEN);text(im,(824,745),'例：7000MB/s',46,GREEN)
                    text(im,(72,809),'数値は比較用の例。写真の製品の実測値ではない',36,GREEN,max_width=1420)
                else:
                    text(im,(92,745),'約500MB/s台の製品もある',35,GREEN);text(im,(824,745),'製品や条件によって異なる',35,GREEN)
            elif layout=='lifetime':
                text(im,(92,745),'品質・時間・書き込み量・温度・衝撃・保存環境',36,GREEN)
    elif layout=='capacity':
        photo(im,a[0],(72,240,760,780),'ストレージの実物')
        rect(im,(804,240,1492,780));text(im,(840,273),'保存したい量に合わせる',38,GREEN)
        d=ImageDraw.Draw(im)
        for j,(label,width) in enumerate((('写真・文書',230),('動画・ゲーム',360),('大量の撮影素材',480))):
            y=375+j*123;text(im,(840,y-34),label,32,INK);d.rectangle((840,y+16,840+width,y+40),fill=GREEN)
        text(im,(840,744),'必要量のイメージ（実測値ではない）',28,GREEN)
    elif layout=='storage':
        for j,n in enumerate(notes if len(notes)>1 else ['写真','動画','ゲーム','アプリ']):file_icon(im,175+j*295,270,n)
        arrow(im,(775,425),(775,475))
        photo(im,a[0],(100,490,735,780),'SSD' if a[0]=='crucial_ssd' else '保存先の例')
        photo(im,a[-1],(810,490,1445,780),'HDD')
    elif layout=='agenda':
        photo(im,a[0],(72,240,560,780),'SSD')
        for j,n in enumerate(notes):
            y=246+j*108;rect(im,(630,y,1475,y+88));text(im,(660,y+16),f'{j+1:02d}  {n}',46,GREEN)
    elif layout=='desk':
        rect(im,(72,240,760,780));rect(im,(804,240,1492,780));d=ImageDraw.Draw(im)
        d.rectangle((160,425,650,451),fill='#a7855a');d.rectangle((180,451,200,660),fill='#a7855a');d.rectangle((610,451,630,660),fill='#a7855a')
        file_icon(im,310,304,'今使うデータ')
        d.rectangle((920,320,1380,672),fill='#e6d8bd',outline='#a7855a',width=5)
        for y in (430,540):d.line((920,y,1380,y),fill='#a7855a',width=8)
        for j in range(6):d.rectangle((955+j*55,465,996+j*55,535),fill=LIGHT,outline=GREEN,width=2)
        text(im,(416,718),'RAM：机の上',42,GREEN,'mm');text(im,(1148,718),'ストレージ：しまう棚',42,GREEN,'mm')
    elif layout=='hdd':
        x,y,w,h=photo(im,a[0],PHOTO_BOX)
        target=(x+int(.83*w),y+int(.44*h)) if 'ヘッド' in s['note'] else (x+int(.67*w),y+int(.19*h))
        bx=x+min(120,w//10);by=y+int(.10*h)
        rect(im,(bx,by,bx+360,by+80),WHITE,GREEN,3)
        text(im,(bx+24,by+17),'ヘッド' if 'ヘッド' in s['note'] else 'プラッタ',40,GREEN)
        arrow(im,(bx+360,by+40),target)
        if s['note']=='ヘッドの移動':arrow(im,(target[0]-150,target[1]+65),(target[0],target[1]+65),ORANGE)
        if s['note']=='プラッタの回転':
            ImageDraw.Draw(im).arc((x+int(.56*w),y+int(.02*h),x+int(.95*w),y+int(.36*h)),25,320,fill=GREEN,width=6)
    elif layout=='headgap':
        photo(im,a[0],(72,240,900,780),'実物のヘッドの接写')
        rect(im,(944,240,1492,780));text(im,(972,273),'接触しない（模式図）',36,GREEN)
        d=ImageDraw.Draw(im);d.rectangle((980,625,1440,648),fill='#b4bfc4')
        d.polygon(((1000,420),(1380,420),(1370,490),(1350,510),(1330,490),(1000,470)),fill='#8898a0')
        arrow(im,(1360,615),(1360,520));text(im,(982,690),'プラッタとの間にすき間',34,INK,max_width=480)
    elif layout=='nand':
        x,y,w,h=photo(im,a[0],PHOTO_BOX)
        d=ImageDraw.Draw(im);d.rectangle((x+int(.44*w),y+int(.12*h),x+int(.69*w),y+int(.40*h)),outline='#ffc762',width=7)
        rect(im,(x+25,y+40,x+385,y+122),WHITE,GREEN,3);text(im,(x+46,y+56),'NANDメモリ',40,GREEN)
        arrow(im,(x+385,y+81),(x+int(.45*w),y+int(.23*h)))
    elif layout=='controller':
        photo(im,a[0],(72,240,820,780),'NANDフラッシュメモリの実物')
        rect(im,(860,240,1492,780));text(im,(892,273),'SSD内部の役割（模式図）',34,GREEN)
        for j,(label,col) in enumerate((('PC',BLUE),('コントローラー',GREEN),('NANDメモリ',ORANGE))):
            y=354+j*125;rect(im,(918,y,1425,y+90),WHITE,col,3);text(im,(1172,y+45),label,40,col,'mm')
            if j<2:arrow(im,(1172,y+92),(1172,y+122),col)
    elif layout=='sequence':
        rect(im,(72,240,1492,780));d=ImageDraw.Draw(im)
        labels=['連続した場所を順番に読む','離れた場所を次々に読む']
        for j in range(2):
            y=285+j*232;text(im,(108,y),labels[j],42,GREEN)
            for k in range(10):rect(im,(130+k*130,y+96,226+k*130,y+178),LIGHT,GREEN,2);text(im,(178+k*130,y+137),str(k+1),32,GREEN,'mm')
            order=list(range(10)) if j==0 else [0,6,2,8,4]
            for k in order:d.rectangle((130+k*130,y+165,226+k*130,y+178),fill=BLUE if j==0 else ORANGE)
            for k1,k2 in zip(order,order[1:]):arrow(im,(178+k1*130,y+82),(178+k2*130,y+82),BLUE if j==0 else ORANGE,3)
    elif layout=='bits':
        photo(im,a[0],(72,240,680,780),'NANDメモリの実物')
        for j,(label,bits) in enumerate((('TLC',3),('QLC',4))):
            y=252+j*257;rect(im,(722,y,1492,y+230));text(im,(754,y+18),f'{label}：1セルあたり{bits}ビット',40,GREEN)
            for k in range(bits):rect(im,(768+k*155,y+90,885+k*155,y+191),LIGHT,GREEN,3);text(im,(826+k*155,y+140),'0 / 1',30,GREEN,'mm')
    elif layout=='tracks':
        rect(im,(72,240,1492,780));text(im,(108,257),'記録トラックの模式図',32,GREEN)
        for j,label in enumerate(('CMR：隣り合う','SMR：一部が重なる')):
            x=108+j*716;text(im,(x,322),label,38,GREEN)
            for k in range(5):
                y=412+k*(63 if j==0 else 40)
                rect(im,(x,y,x+600,y+50),LIGHT if k%2==0 else '#cfe2d5',GREEN,2)
    elif layout=='rpm':
        photo(im,a[0],(72,240,880,780),'HDD内部の実物')
        for j,label in enumerate(('5400RPM','7200RPM')):
            y=280+j*240;text(im,(940,y),label,62,GREEN);text(im,(940,y+94),'1分間の回転数',36,INK)
    elif layout in ('backup','backup321'):
        copies=[('元のデータ',a[0]),('別の保存先',a[-1])]
        if layout=='backup321':copies.append(('別の場所',None))
        box_width=445 if len(copies)==3 else 680
        for j,(label,aa) in enumerate(copies):
            x=72+j*(481 if len(copies)==3 else 736);rect(im,(x,268,x+box_width,750))
            if aa:photo(im,aa,(x+16,354,x+box_width-16,670))
            else:
                d=ImageDraw.Draw(im);d.polygon(((x+95,484),(x+220,385),(x+345,484)),fill=LIGHT,outline=GREEN)
                d.rectangle((x+121,484,x+319,640),fill=WHITE,outline=GREEN,width=4);d.rectangle((x+198,540,x+244,640),fill=LIGHT,outline=GREEN,width=3)
            text(im,(x+box_width//2,310),label,37,GREEN,'mm');text(im,(x+box_width//2,705),'同じ大切なデータ',30,INK,'mm')
        if layout=='backup321':text(im,(770,799),'3つのコピー  /  2種類の保存先  /  1つは別の場所',38,GREEN,'mm',max_width=1420)
    elif layout=='price':
        photo(im,a[0],(72,240,700,720),'SSD');photo(im,a[-1],(768,240,1492,720),'HDD')
        text(im,(790,779),'価格 ÷ 容量 ＝ 容量あたりの価格',48,GREEN,'mm',max_width=1400)
    elif layout in ('usage','fps','usb','tbw'):
        photo(im,a[0],(72,240,880,780),'SSD' if layout!='usb' else '外付けSSDの実物')
        rect(im,(920,240,1492,780))
        if layout=='fps':ls=['起動・ロード','データの読み込み','FPSとは別の指標']
        elif layout=='usb':ls=['SSD本体','USB・ケーブル','接続側も速度に関係']
        elif layout=='tbw':ls=['総書き込み量','耐久性の目安','保証条件も確認']
        elif s['source_index']==83:ls=['Windows','アプリ・ゲーム','必要な容量で選ぶ']
        else:ls=notes if len(notes)>1 else (['公称の数値','実際の処理時間','同じ倍率にはならない'] if 'ベンチマーク' in s['note'] else (['Windows・アプリ','普段使う保存先'] if 'メインストレージ' in s['note'] else ['アクセスの速さを','起動や操作に活かす'] if 'アクセス' in s['note'] else ['ゲームの起動','ステージのロード'] if '大量のデータ' in s['note'] else ['素材','キャッシュ','プロジェクト']))
        for j,n in enumerate(ls):text(im,(954,303+j*138),n,40,GREEN,max_width=490)
    else:
        photo(im,a[0],PHOTO_BOX)
    if layout not in ('chapter','roles','specspeed','lifetime','backup321','price'):
        text(im,(72,809),s['note'].replace('／','  /  '),36,GREEN,max_width=1420)
    # A fixed full-width opaque caption box protects legibility on every visual.
    rect(im,CAPTION_BOX,WHITE,LINE,2)
    ImageDraw.Draw(im).rectangle((72,878,81,1042),fill=GREEN)
    # Same baseline, scale, and side for all genuine v2.3 poses; no time expression.
    with Image.open(POSES/f"zundamon_{s['pose']}.png") as src:
        z=src.convert('RGBA');z=z.resize((round(z.width*550/z.height),550),Image.Resampling.LANCZOS)
    im.paste(z,(1699-z.width//2,846-z.height),z)
    text(im,(1699,245),'ずんだもん',30,GREEN,'mm')
    # Encode in memory and atomically publish a complete PNG. Verify the bytes
    # before an external decoder can consume them; incomplete frames must fail.
    encoded=io.BytesIO();im.save(encoded,format='PNG');payload=encoded.getvalue()
    with Image.open(io.BytesIO(payload)) as check:check.load()
    temp=path.with_suffix('.tmp')
    for attempt in range(3):
        temp.write_bytes(payload)
        if temp.read_bytes()==payload:
            temp.replace(path)
            if path.read_bytes()==payload:break
    else:raise IOError(f'Could not persist complete frame: {path}')


def read_rows():
    with (VOICE/'narration_timestamps.tsv').open(encoding='utf-8') as f:
        return [{'index':int(x['index']),'start':float(x['start']),'end':float(x['end']),'section':x['section'],'text':x['text']} for x in csv.DictReader(f,delimiter='\t')]

def probe_duration(p):
    return float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','csv=p=0',str(p)],text=True).strip())

def build_scenes(rows,total):
    plan=json.loads((ROOT/'authored_storyboard_v16.json').read_text(encoding='utf-8'))['scenes']
    if len(plan)!=len(rows):raise ValueError('Storyboard and narration have different lengths')
    scenes=[];cursor=0
    for r,p in zip(rows,plan):
        if r['index']!=p['source_index'] or hashlib.sha256(r['text'].encode()).hexdigest()!=p['source_sha256']:
            raise ValueError(f"Narration changed at sentence {r['index']}; revise the storyboard")
        if round(r['start']*FPS)<cursor or r['end']<=r['start']:raise ValueError('Invalid narration timing')
        start=round(r['start']*FPS);end=round(r['end']*FPS)
        if start>cursor:
            chapter={**p,'layout':'chapter','title':'','note':'','section':r['section'],'pose':'normal','start_frame':cursor,'end_frame':start,'source_text':'','source_index':0}
            scenes.append(chapter)
        s={**p,'start_frame':start,'end_frame':end,'section':r['section'],'source_text':r['text']}
        scenes.append(s);cursor=end
    final_frame=round(total*FPS)
    if cursor<final_frame:scenes[-1]['end_frame']=final_frame
    if cursor>final_frame+1:raise ValueError('Narration exceeds audio duration')
    # Merge only identical adjacent compositions; no hold limit and no anti-repeat rule.
    merged=[]
    key=lambda s:tuple(json.dumps(s.get(k),ensure_ascii=False) for k in ('layout','title','note','assets','pose','section'))
    for s in scenes:
        if merged and key(merged[-1])==key(s) and merged[-1]['end_frame']==s['start_frame']:
            merged[-1]['end_frame']=s['end_frame'];merged[-1]['source_text']+=' '+s['source_text']
        else:merged.append(s)
    return merged


def ass_time(t):
    cs=round(t*100);h,cs=divmod(cs,360000);m,cs=divmod(cs,6000);s,cs=divmod(cs,100)
    return f'{h}:{m:02}:{s:02}.{cs:02}'

def subtitles(rows,start,end,path=None):
    # Preserve established V15 cue timing. Only appearance changes; no pop or zoom.
    source=VOICE/'subtitles_source.ass'
    if not source.exists():raise FileNotFoundError('Copy verified V15 subtitles to voice/subtitles_source.ass')
    header='''[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
WrapStyle: 2
ScaledBorderAndShadow: yes
YCbCr Matrix: TV.709

[V4+ Styles]
Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding
Style: Main,Noto Sans CJK JP,76,&H003F6921,&H003F6921,&H00FFFFFF,&H00FFFFFF,-1,0,0,0,100,100,0,0,1,1,0,5,105,105,0,1

[Events]
Format: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text
'''
    def sec(v):
        h,m,s=map(float,v.split(':'));return 3600*h+60*m+s
    events=[]
    for line in source.read_text(encoding='utf-8-sig').splitlines():
        if not line.startswith('Dialogue:'):continue
        f=line.split(',',9);st=sec(f[1]);en=sec(f[2]);s=re.sub(r'\{[^}]*\}','',f[9])
        if en<=start or st>=end:continue
        # Fit actual pixel width, including long ASCII names, rather than count characters.
        size=76
        while ImageDraw.Draw(Image.new('RGB',(1,1))).textlength(s,font=font(size))>1690 and size>56:size-=1
        if ImageDraw.Draw(Image.new('RGB',(1,1))).textlength(s,font=font(size))>1690:raise ValueError(f'Caption too wide: {s}')
        tags=f'{{\\an5\\pos(960,960)\\fs{size}}}'
        events.append(f'Dialogue: 1,{ass_time(max(st,start)-start)},{ass_time(min(en,end)-start)},Main,,0,0,0,,{tags}{s}')
    p=path or OUT/'subtitles_v16.ass';p.write_text(header+'\n'.join(events)+'\n',encoding='utf-8-sig');return p

def encode_scene_segments(scenes,image_dir,rows,start_frame,end_frame,mixed,final):
    """Encode finite scenes independently, then concatenate verified frame counts."""
    segment_dir=OUT/'segments';segment_dir.mkdir(exist_ok=True);jobs=[]
    for i,s in enumerate(scenes):
        st=max(start_frame,s['start_frame']);en=min(end_frame,s['end_frame'])
        if en<=st:continue
        cue=subtitles(rows,st/FPS,en/FPS,segment_dir/f'{i:03}.ass')
        jobs.append((i,s,st,en,cue,segment_dir/f'{i:03}.mp4'))
    def encode(job):
        i,s,st,en,cue,destination=job;frames=en-st;duration=frames/FPS
        inputs=['-loop','1','-framerate',str(FPS),'-i',str(image_dir/f'{i:03}.png')]
        fc=[]
        if s['layout']=='motion':
            inputs+=['-ss',str(s['video_start']+(st-s['start_frame'])/FPS),'-t',str(duration),'-i',str(asset_path(s['assets'][0]))]
            fc.append(f'[1:v]scale=1396:516:force_original_aspect_ratio=decrease,pad=1396:516:(ow-iw)/2:(oh-ih)/2:color=white,fps={FPS},setpts=PTS-STARTPTS[m]')
            fc.append('[0:v][m]overlay=84:252:shortest=0:eof_action=repeat[picture]')
        else:fc.append('[0:v]null[picture]')
        fc.append(f'[picture]ass={cue}:fontsdir={FONT.parent}[v]')
        subprocess.run(['ffmpeg','-y','-xerror','-loglevel','error',*inputs,'-filter_complex_threads','1','-filter_complex',';'.join(fc),'-map','[v]','-an','-frames:v',str(frames),'-t',str(duration),'-r',str(FPS),'-c:v','libx264','-preset','veryfast','-crf','21','-threads','2','-pix_fmt','yuv420p',str(destination)],check=True)
        info=json.loads(subprocess.check_output(['ffprobe','-v','error','-select_streams','v:0','-show_entries','stream=nb_frames,duration','-of','json',str(destination)],text=True))['streams'][0]
        if int(info['nb_frames'])!=frames:raise ValueError(f'Segment {i} frame count mismatch')
        return frames
    done=0;covered=0
    with ThreadPoolExecutor(max_workers=2) as pool:
        for future in as_completed([pool.submit(encode,j) for j in jobs]):
            covered+=future.result();done+=1
            (OUT/'segment_progress.json').write_text(json.dumps({'completed':done,'total':len(jobs),'encoded_frames':covered,'expected_frames':end_frame-start_frame}))
            if done%10==0 or done==len(jobs):print('SCENE_ENCODING',done,'/',len(jobs),flush=True)
    assert covered==end_frame-start_frame
    concat=OUT/'concat_segments.txt';concat.write_text('\n'.join("file '"+str(j[-1].resolve())+"'" for j in jobs)+'\n')
    subprocess.run(['ffmpeg','-y','-xerror','-loglevel','warning','-f','concat','-safe','0','-i',str(concat),'-i',str(mixed),'-map','0:v:0','-map','1:a:0','-c','copy','-t',str((end_frame-start_frame)/FPS),'-movflags','+faststart',str(final)],check=True)



def main():
    global ASSETS,VOICE,POSES,OUT,FONT
    ap=argparse.ArgumentParser();ap.add_argument('--assets',type=Path,default=Path('real_assets'));ap.add_argument('--voice',type=Path,default=Path('voice'));ap.add_argument('--poses',type=Path,default=Path('zundamon_poses'));ap.add_argument('--out',type=Path,default=Path('authored_video_output'));ap.add_argument('--font',type=Path,default=Path('/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc'));ap.add_argument('--start',type=float,default=0);ap.add_argument('--seconds',type=float,default=0);ap.add_argument('--plan-only',action='store_true')
    args=ap.parse_args();ASSETS=args.assets;VOICE=args.voice;POSES=args.poses;OUT=args.out;FONT=args.font;OUT.mkdir(parents=True,exist_ok=True)
    rows=read_rows();voice=VOICE/'SSD_HDD_NARRATION_ZUNDAMON_48k.wav';total=probe_duration(voice);scenes=build_scenes(rows,total)
    for s in scenes:
        for a in s['assets']:asset_path(a)
        if not (POSES/f"zundamon_{s['pose']}.png").exists():raise FileNotFoundError(s['pose'])
    (OUT/'storyboard.json').write_text(json.dumps(scenes,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    with (OUT/'storyboard.tsv').open('w',encoding='utf-8',newline='') as f:
        writer=csv.writer(f,delimiter='\t');writer.writerow(['start','end','source_index','layout','assets','title','note','source_text'])
        for s in scenes:writer.writerow([s['start_frame']/FPS,s['end_frame']/FPS,s['source_index'],s['layout'],','.join(s['assets']),s['title'],s['note'],s['source_text']])
    # Fail before any expensive encoding if a label or photograph is invalid.
    image_dir=OUT/'scene_frames';image_dir.mkdir(exist_ok=True)
    for i,s in enumerate(scenes):render_scene(s,image_dir/f'{i:03}.png')
    if args.plan_only:
        print('AUTHORED_PLAN_QA_OK',len(rows),'sentences',len(scenes),'compositions',flush=True);return
    start_frame=max(0,round(args.start*FPS));end_frame=min(round(total*FPS),round((args.start+args.seconds)*FPS)) if args.seconds>0 else round(total*FPS)
    if end_frame<=start_frame:raise ValueError('Empty render window')
    start=start_frame/FPS;end=end_frame/FPS;ass=subtitles(rows,start,end)
    selected=[]
    for i,s in enumerate(scenes):
        st=max(start_frame,s['start_frame']);en=min(end_frame,s['end_frame'])
        if en>st:selected.append((s,image_dir/f'{i:03}.png',en-st))
    final=OUT/'SSD_HDD_V16_FHD_60FPS.mp4'
    bgm=asset_path('bgm_mellowtron')
    # Produce a finite soundtrack independently before the verified scene mux.
    mixed=OUT/'mixed_audio.m4a'
    audio_fc=';'.join([
        '[0:a]aresample=48000,aformat=channel_layouts=stereo[n]',
        f'[1:a]atrim=duration={end-start},volume=0.035,afade=t=out:st={max(0,end-start-2)}:d=2[b]',
        '[n][b]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.95:level=0:latency=1[a]'])
    subprocess.run(['ffmpeg','-y','-xerror','-loglevel','warning','-ss',str(start),'-i',str(voice),'-stream_loop','-1','-i',str(bgm),'-filter_complex',audio_fc,'-map','[a]','-t',str(end-start),'-c:a','aac','-b:a','192k','-ar','48000',str(mixed)],check=True)
    if abs(probe_duration(mixed)-(end-start))>.1:raise ValueError('Mixed audio duration mismatch')
    print('RENDER_AUTHORED',len(scenes),'compositions',end-start,'seconds',flush=True)
    encode_scene_segments(scenes,image_dir,rows,start_frame,end_frame,mixed,final)
    probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(final)],text=True));(OUT/'ffprobe.json').write_text(json.dumps(probe,indent=2))
    v=next(x for x in probe['streams'] if x['codec_type']=='video');au=next(x for x in probe['streams'] if x['codec_type']=='audio')
    assert (v['width'],v['height'],v['r_frame_rate'])==(1920,1080,'60/1')
    assert int(v['nb_frames'])==end_frame-start_frame
    assert au['sample_rate']=='48000' and au['channels']==2
    assert abs(float(probe['format']['duration'])-(end-start))<.1
    credit_sources=[ASSETS/'ATTRIBUTION.md',ASSETS/'ATTRIBUTION_EXTRA.md']
    if any(p.exists() for p in credit_sources):
        credits='\n\n'.join(p.read_text(encoding='utf-8') for p in credit_sources if p.exists())
        credits+='\nVOICEVOX:ずんだもん\n立ち絵: 坂本アヒル ずんだもん立ち絵素材2.3 / im10788496\nフォント: Noto Sans CJK / SIL Open Font License 1.1\n'
        (OUT/'ATTRIBUTION.md').write_text(credits,encoding='utf-8')
    print('AUTHORED_RENDER_QA_OK',final,end-start,flush=True)

if __name__=='__main__':main()
