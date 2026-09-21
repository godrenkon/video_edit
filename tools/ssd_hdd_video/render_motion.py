#!/usr/bin/env python3
from __future__ import annotations
import ast, math, os, re, subprocess, wave
from pathlib import Path
import requests
import numpy as np
import soundfile as sf
from PIL import Image, ImageDraw, ImageFont, ImageFilter
from janome.tokenizer import Tokenizer

W,H,FPS = 1920,1080,60
ROOT = Path(__file__).resolve().parent
WORK = ROOT / "_motion_build"
OUT = Path("output_motion")
WORK.mkdir(parents=True, exist_ok=True)
OUT.mkdir(parents=True, exist_ok=True)

BG0=(7,12,25); BG1=(16,27,50); WHITE=(243,247,253); MUTED=(149,163,188)
SSD=(53,137,255); HDD=(246,158,68); CYAN=(70,220,224); RED=(255,88,103); GREEN=(80,210,143); PANEL=(20,31,55)
FONT_BOLD="/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc"
FONT_REG="/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"

def fnt(sz,b=True): return ImageFont.truetype(FONT_BOLD if b else FONT_REG,sz)
def txt(d,xy,s,size,fill=WHITE,anchor="la",bold=True): d.text(xy,s,font=fnt(size,bold),fill=fill,anchor=anchor)
def rr(d,box,r,fill,outline=None,width=2): d.rounded_rectangle(box,radius=r,fill=fill,outline=outline,width=width)

def load_sections():
    src=(ROOT/"render.py").read_text(encoding="utf-8")
    mod=ast.parse(src)
    for node in mod.body:
        if isinstance(node,ast.Assign):
            for target in node.targets:
                if isinstance(target,ast.Name) and target.id=="SECTIONS":
                    return ast.literal_eval(node.value)
    raise RuntimeError("SECTIONS not found")
SECTIONS=load_sections()
TOTAL_SENT=sum(len(s) for _,s in SECTIONS)
JP_TOKENIZER = Tokenizer()

_grad = np.linspace(np.array(BG0,dtype=np.float32), np.array(BG1,dtype=np.float32), H, dtype=np.float32)[:,None,:]
_grad = np.repeat(_grad, W, axis=1).astype(np.uint8)
BASE_BG = Image.fromarray(_grad, "RGB")

def bg_image(title, caption=""):
    # Layered dark-tech background: soft glows, sparse particles, circuit lines,
    # and a compact chapter badge. No baked narration text lives here.
    if "バックアップ" in title:
        accent = GREEN
    elif "寿命" in title:
        accent = RED
    elif "HDD" in title and "SSD" not in title:
        accent = HDD
    elif "SSD" in title and "HDD" not in title:
        accent = SSD
    else:
        accent = CYAN

    im = BASE_BG.copy().convert("RGBA")

    glow = Image.new("RGBA",(W,H),(0,0,0,0))
    gd = ImageDraw.Draw(glow,"RGBA")
    gd.ellipse((-380,130,760,1270), fill=(*accent,38))
    gd.ellipse((1180,-380,2320,760), fill=(*SSD,22))
    gd.ellipse((760,580,1500,1320), fill=(*HDD,12))
    glow = glow.filter(ImageFilter.GaussianBlur(170))
    im = Image.alpha_composite(im, glow)

    d = ImageDraw.Draw(im,"RGBA")

    # Fine technical grid/circuit traces.
    for x in range(80,W,160):
        d.line((x,205,x,H-90),fill=(255,255,255,8),width=1)
    for y in range(225,H-90,120):
        d.line((65,y,W-65,y),fill=(255,255,255,8),width=1)
    for x in range(160,W-220,330):
        y = 270 + ((x//330)%3)*120
        d.line((x,y,x+155,y),fill=(*accent,22),width=2)
        d.ellipse((x+151,y-4,x+159,y+4),fill=(*accent,55))

    # Sparse particles; deterministic per title.
    seed = sum((i+1)*ord(ch) for i,ch in enumerate(title)) & 0xffffffff
    rng = np.random.default_rng(seed)
    for _ in range(58):
        px=int(rng.integers(70,W-70)); py=int(rng.integers(170,H-100))
        r=int(rng.integers(1,3)); a=int(rng.integers(18,48))
        d.ellipse((px-r,py-r,px+r,py+r),fill=(220,235,255,a))

    # Top chrome.
    chap = re.search(r"第(\d+)章", title)
    badge = f"CHAPTER {int(chap.group(1)):02d}" if chap else ("INTRO" if "オープニング" in title else "STORAGE GUIDE")
    rr(d,(86,56,300,108),16,(*accent,34),outline=(*accent,120),width=2)
    txt(d,(193,82),badge,22,accent,"mm",True)
    shown_title = title.split("　",1)[-1] if "　" in title else title
    txt(d,(330,82),shown_title,31,WHITE,"lm",True)
    txt(d,(1810,82),"SSD / HDD",22,MUTED,"rm",True)

    # Lower progress rail and vignette.
    d.rounded_rectangle((86,1017,1834,1023),radius=3,fill=(255,255,255,18))
    vig = Image.new("RGBA",(W,H),(0,0,0,0))
    vd = ImageDraw.Draw(vig,"RGBA")
    for k,a in [(0,90),(22,52),(45,24)]:
        vd.rectangle((k,k,W-k,H-k),outline=(0,0,0,a),width=28)
    vig = vig.filter(ImageFilter.GaussianBlur(18))
    im = Image.alpha_composite(im, vig)
    return im


def short_caption(s):
    pairs=[
        ("電源を切", "電源を切ってもデータは残る"),
        ("RAM", "RAM = 作業中　/　SSD・HDD = 保存"),
        ("メモリ", "メモリとストレージは役割が違う"),
        ("プラッタ", "磁気ディスクにデータを記録"),
        ("ヘッド", "ヘッドが物理的に移動"),
        ("回ってくる", "目的の場所が来るまで待つ"),
        ("NAND", "SSD = NAND + コントローラー"),
        ("コントローラー", "SSD内部の管理役"),
        ("機械的な移動", "SSDには物理的な移動待ちがない"),
        ("動作音", "HDDは機械音あり / SSDは機械音なし"),
        ("振動", "可動部品の有無で振動も変わる"),
        ("衝撃", "可動部品の有無が衝撃耐性に影響"),
        ("シーケンシャル", "大きなデータを順番に読む"),
        ("ランダム", "細かなデータを各所から読む"),
        ("FPS", "ロード時間 ≠ FPS"),
        ("M.2", "M.2 ≠ NVMe"),
        ("NVMe", "M.2は形 / NVMeは通信仕様"),
        ("TLC", "TLC = 3bit / QLC = 4bit"),
        ("QLC", "NANDだけで性能は決まらない"),
        ("CMR", "CMRとSMRは記録方式が違う"),
        ("SMR", "高密度化と書き換え特性"),
        ("容量あたり", "大容量ほど1TBあたりの価格が重要"),
        ("TBW", "TBW ≠ 壊れる瞬間"),
        ("永久", "SSDもHDDも永久ではない"),
        ("3-2-1", "3コピー・2種類・1つは別の場所"),
        ("一台が壊", "1台壊れても残る状態を作る"),
        ("Windows", "OS・アプリはSSDと相性がいい"),
        ("ゲーム", "ゲームはロード時間でSSDが有利"),
        ("動画編集", "作業中はSSD / 保管はHDD"),
        ("NAS", "NASでは大容量HDDも有力"),
        ("USB", "外付けSSDは接続規格も重要"),
        ("完全に上", "勝ち負けではなく、用途で選ぶ"),
        ("使い分け", "SSD + HDD という使い分け"),
    ]
    for k,v in pairs:
        if k in s: return v
    # Fallback should stay short and never cut a long sentence mid-way.
    if "HDD" in s and "SSD" in s: return "SSDとHDDは、仕組みから違う"
    if "HDD" in s: return "HDDの特徴を仕組みから理解"
    if "SSD" in s: return "SSDの特徴を仕組みから理解"
    return ""

def scene_kind(title,s):
    if "HDDとは" in title: return "hdd"
    if "SSDとは" in title: return "ssd"
    if "何が違う" in title: return "compare"
    if "速度" in title: return "speed"
    if "種類" in title:
        if "CMR" in s or "SMR" in s: return "cmr"
        return "types"
    if "容量" in title: return "price"
    if "寿命" in title: return "life"
    if "バックアップ" in title: return "backup"
    if "用途" in title: return "use"
    if "最終" in title: return "final"
    if "第1章" in title: return "storage"
    return "intro"

def save(im,name):
    p=WORK/name; im.save(p); return p

def make_base(title,s,kind):
    im=bg_image(title,""); d=ImageDraw.Draw(im,"RGBA")
    if kind=="storage":
        rr(d,(260,300,790,700),34,(20,34,58,235),outline=CYAN,width=4)
        rr(d,(1130,300,1660,700),34,(20,34,58,235),outline=SSD,width=4)
        txt(d,(525,400),"RAM",62,CYAN,"mm"); txt(d,(1395,400),"SSD / HDD",58,SSD,"mm")
        txt(d,(525,535),"作業中",42,WHITE,"mm"); txt(d,(1395,535),"保存",42,WHITE,"mm")
        txt(d,(960,520),"≠",76,MUTED,"mm")
    elif kind=="hdd":
        txt(d,(960,260),"HDDの内部構造",52,WHITE,"mm")
        txt(d,(1360,430),"PLATTER",30,HDD,"lm")
        txt(d,(1360,500),"HEAD / ARM",30,HDD,"lm")
        txt(d,(1360,570),"磁気で記録",30,MUTED,"lm")
    elif kind=="ssd":
        rr(d,(610,290,1310,735),40,(15,54,60,240),outline=SSD,width=6)
        txt(d,(960,345),"SSD",54,SSD,"mm")
        for x,y in [(760,470),(1160,470),(760,620),(1160,620)]:
            rr(d,(x-115,y-60,x+115,y+60),14,(26,35,50),outline=(70,97,118),width=3); txt(d,(x,y),"NAND",30,WHITE,"mm")
        rr(d,(870,500,1050,610),16,(27,82,112),outline=CYAN,width=4); txt(d,(960,555),"CTRL",30,CYAN,"mm")
    elif kind=="compare":
        txt(d,(500,260),"HDD",48,HDD,"mm"); txt(d,(1420,260),"SSD",48,SSD,"mm"); txt(d,(960,265),"VS",38,MUTED,"mm")
        d.line((960,300,960,760),fill=(255,255,255,26),width=2)
        rr(d,(1160,365,1660,670),34,(15,54,60,235),outline=SSD,width=5)
        for x,y in [(1280,455),(1540,455),(1280,585),(1540,585)]:
            rr(d,(x-82,y-45,x+82,y+45),12,(27,36,51),outline=(68,95,116),width=2)
            txt(d,(x,y),"NAND",24,WHITE,"mm")
        rr(d,(1360,500,1460,570),12,(27,82,112),outline=CYAN,width=3)
        txt(d,(1410,535),"CTRL",22,CYAN,"mm")
    elif kind=="speed":
        txt(d,(960,280),"アクセス速度の違い",52,WHITE,"mm")
        labels=[("HDD",HDD,0.22),("SATA SSD",SSD,0.58),("NVMe SSD",CYAN,0.92)]
        y=390
        for name,c,v in labels:
            txt(d,(345,y),name,32,c,"lm"); rr(d,(600,y-25,1530,y+25),24,(28,42,67)); d.rectangle((600,y-25,600+int(930*v),y+25),fill=c); y+=125
    elif kind=="types":
        txt(d,(960,280),"SSD / HDD の種類",52,WHITE,"mm")
        cards=[(350,"2.5-inch\nSATA",SSD),(790,"M.2 SATA",CYAN),(1230,"M.2 NVMe",GREEN),(1610,"HDD",HDD)]
        for x,lab,c in cards:
            rr(d,(x-170,410,x+170,600),26,(20,34,58),outline=c,width=4)
            for j,line in enumerate(lab.split("\n")): txt(d,(x,485+j*44),line,31,c,"mm")
        if "M.2" in s or "NVMe" in s: txt(d,(960,720),"M.2  ≠  NVMe",58,RED,"mm")
    elif kind=="cmr":
        txt(d,(520,300),"CMR",48,HDD,"mm"); txt(d,(1400,300),"SMR",48,HDD,"mm")
        for j in range(5):
            d.line((280,420+j*58,760,420+j*58),fill=HDD,width=18)
            off=j*28; d.line((1120+off,420+j*58,1580+off,420+j*58),fill=HDD,width=18)
    elif kind=="price":
        txt(d,(960,275),"容量と価格",52,WHITE,"mm")
        vals=[("1TB",.18),("2TB",.30),("4TB",.50),("8TB",.72),("16TB",.94)]
        y=355
        for lab,v in vals:
            txt(d,(315,y),lab,30,WHITE,"lm"); rr(d,(500,y-20,1500,y+20),19,(28,42,66)); d.rectangle((500,y-20,500+int(1000*v),y+20),fill=HDD); y+=100
    elif kind=="life":
        txt(d,(500,300),"SSD",48,SSD,"mm"); txt(d,(1420,300),"HDD",48,HDD,"mm")
        rr(d,(280,420,720,500),18,(28,41,64)); rr(d,(280,420,640,500),18,SSD); txt(d,(500,460),"NAND / TBW",30,WHITE,"mm")
        txt(d,(500,620),"書き込みによる劣化",30,MUTED,"mm"); txt(d,(1420,620),"機械部品の故障",30,MUTED,"mm")
    elif kind=="backup":
        txt(d,(960,300),"3 - 2 - 1",80,GREEN,"mm")
        for x,n,lab in [(450,"3","コピー"),(960,"2","種類の保存先"),(1470,"1","別の場所")]:
            rr(d,(x-180,430,x+180,650),30,(20,34,58),outline=GREEN,width=4); txt(d,(x,505),n,74,GREEN,"mm"); txt(d,(x,600),lab,27,WHITE,"mm")
    elif kind=="use":
        txt(d,(960,275),"用途で選ぶ",52,WHITE,"mm")
        for i,name in enumerate(["OS","GAME","EDIT","ARCHIVE","NAS","EXTERNAL"]):
            x=360+(i%3)*600; y=410+(i//3)*235
            col=SSD if name in ("OS","GAME","EDIT") else HDD
            rr(d,(x-180,y-65,x+180,y+65),26,(20,34,58),outline=col,width=4); txt(d,(x,y),name,36,WHITE,"mm")
    elif kind=="final":
        txt(d,(500,300),"HDD",52,HDD,"mm"); txt(d,(1420,300),"SSD",52,SSD,"mm"); txt(d,(960,505),"+",100,GREEN,"mm")
        txt(d,(960,700),"勝ち負けではなく、使い分け",48,WHITE,"mm")
    else:
        txt(d,(960,300),"SSD と HDD",78,WHITE,"mm")
        txt(d,(960,405),"役割は同じ。仕組みは違う。",42,MUTED,"mm")
    return im

def sprite_platter():
    S=600; im=Image.new("RGBA",(S,S),(0,0,0,0)); d=ImageDraw.Draw(im,"RGBA"); cx=cy=S//2
    d.ellipse((60,60,540,540),fill=(33,44,65,255),outline=HDD,width=8)
    for r in [90,145,205]: d.ellipse((cx-r,cy-r,cx+r,cy+r),outline=(100,115,145,220),width=3)
    d.ellipse((270,270,330,330),fill=(120,130,145,255))
    for a in range(0,360,30):
        rad=math.radians(a); x1=cx+220*math.cos(rad); y1=cy+220*math.sin(rad); x2=cx+238*math.cos(rad); y2=cy+238*math.sin(rad); d.line((x1,y1,x2,y2),fill=(255,255,255,100),width=4)
    d.rounded_rectangle((435,280,515,320),radius=8,fill=(255,199,88,240))
    return im

def sprite_arm():
    S=600; im=Image.new("RGBA",(S,S),(0,0,0,0)); d=ImageDraw.Draw(im,"RGBA"); cx=cy=S//2
    d.ellipse((cx-40,cy-40,cx+40,cy+40),fill=(105,115,130,255))
    d.line((cx,cy,cx-245,cy+90),fill=HDD,width=26)
    d.ellipse((cx-265,cy+75,cx-225,cy+115),fill=HDD)
    return im

def sprite_glow(col=CYAN):
    S=96; im=Image.new("RGBA",(S,S),(0,0,0,0)); d=ImageDraw.Draw(im,"RGBA")
    for r,a in [(44,20),(34,40),(24,80),(14,220)]: d.ellipse((48-r,48-r,48+r,48+r),fill=(*col,a))
    return im.filter(ImageFilter.GaussianBlur(2))

def sprite_scan(col=CYAN):
    im=Image.new("RGBA",(120,520),(0,0,0,0)); d=ImageDraw.Draw(im,"RGBA")
    for x,a in [(20,30),(35,55),(50,100),(60,220),(70,100),(85,55),(100,30)]: d.rectangle((x,0,x+5,520),fill=(*col,a))
    return im

def write_sprites():
    paths={}
    for name,im in [("platter",sprite_platter()),("arm",sprite_arm()),("glow",sprite_glow()),("scan",sprite_scan())]: paths[name]=save(im,f"{name}.png")
    return paths
SPR=write_sprites()

def tts(text,outwav):
    q=requests.post("http://127.0.0.1:50021/audio_query",params={"text":text,"speaker":3},timeout=120); q.raise_for_status(); data=q.json()
    data["speedScale"]=1.04; data["intonationScale"]=1.06; data["prePhonemeLength"]=0.08; data["postPhonemeLength"]=0.11
    r=requests.post("http://127.0.0.1:50021/synthesis",params={"speaker":3},json=data,timeout=180); r.raise_for_status(); Path(outwav).write_bytes(r.content)

def durwav(p):
    with wave.open(str(p),"rb") as w: return w.getnframes()/w.getframerate()

def run(cmd): print("+"," ".join(map(str,cmd)),flush=True); subprocess.run(list(map(str,cmd)),check=True)

def read_voice_48k(path, pad=0.10):
    y, sr = sf.read(path, dtype="float32")
    if y.ndim > 1:
        y = y.mean(axis=1)
    if sr != 48000:
        old = np.arange(len(y), dtype=np.float64) / sr
        new_len = int(round(len(y) * 48000 / sr))
        new = np.arange(new_len, dtype=np.float64) / 48000
        y = np.interp(new, old, y).astype(np.float32)
    if pad > 0:
        y = np.concatenate([y, np.zeros(int(round(pad*48000)), dtype=np.float32)])
    return y

def render_segment(title,s,kind,wav,dur,idx):
    base=save(make_base(title,s,kind),f"base_{idx:04d}.png")
    out=WORK/f"seg_{idx:04d}.mp4"
    inputs=["-loop","1","-i",str(base)]
    fc=[]; last="[0:v]"; n=1
    if kind in ("hdd","compare"):
        inputs += ["-loop","1","-i",str(SPR["platter"]),"-loop","1","-i",str(SPR["arm"])]
        fc += [f"[{n}:v]format=rgba,rotate='2*PI*t*0.72':c=none:ow=iw:oh=ih[p]", f"[{n+1}:v]format=rgba,rotate='0.10*sin(2*PI*t/2.2)':c=none:ow=iw:oh=ih[a]"]
        x=205 if kind=="compare" else 660; y=250
        fc += [f"{last}[p]overlay={x}:{y}[v1]", f"[v1][a]overlay={x+80}:{y+35}[v2]"]; last="[v2]"; n+=2
    if kind in ("ssd","compare"):
        inputs += ["-loop","1","-i",str(SPR["glow"])]
        if kind=="ssd": xexpr="'912+330*mod(t,1.15)/1.15'"; yexpr="'510-150*mod(t,1.15)/1.15'"
        else: xexpr="'1335+180*mod(t,1.15)/1.15'"; yexpr="'520-100*mod(t,1.15)/1.15'"
        fc += [f"[{n}:v]format=rgba[g]", f"{last}[g]overlay=x={xexpr}:y={yexpr}:shortest=1[v3]"]; last="[v3]"; n+=1
    if kind in ("speed","price","cmr","life","backup","use","types","final","storage","intro"):
        inputs += ["-loop","1","-i",str(SPR["scan"])]
        fc += [f"[{n}:v]format=rgba,colorchannelmixer=aa=0.34[sc]", f"{last}[sc]overlay=x='-120+mod(t*260,{W+240})':y=260:shortest=1[v4]"]; last="[v4]"; n+=1
    fc += [f"{last}fade=t=in:st=0:d=0.18,fade=t=out:st={max(0,dur-0.18):.3f}:d=0.18,format=yuv420p[v]"]
    cmd=["ffmpeg","-y","-loglevel","error",*inputs,"-filter_complex",";".join(fc),"-map","[v]","-t",f"{dur:.3f}","-r",str(FPS),"-an","-c:v","libx264","-preset","veryfast","-crf","16",str(out)]
    run(cmd); return out

def title_segment(title,secidx):
    im=bg_image("",""); d=ImageDraw.Draw(im,"RGBA"); txt(d,(960,430),title,72,WHITE,"mm"); txt(d,(960,540),"SSD / HDD",34,CYAN,"mm"); d.line((620,610,1300,610),fill=CYAN,width=5)
    p=save(im,f"title_{secidx:02d}.png"); out=WORK/f"title_{secidx:02d}.mp4"
    run(["ffmpeg","-y","-loglevel","error","-loop","1","-i",p,"-loop","1","-i",SPR["scan"],"-filter_complex",f"[1:v]format=rgba,colorchannelmixer=aa=0.42[s];[0:v][s]overlay=x='-120+mod(t*420,{W+240})':y=300,fade=t=in:st=0:d=0.25,fade=t=out:st=1.05:d=0.25,format=yuv420p[v]","-map","[v]","-t","1.3","-r",str(FPS),"-an","-c:v","libx264","-preset","veryfast","-crf","17",out])
    return out

def bgm_with_sfx(duration, chapter_times, accent_times, bg_path, se_path):
    """Create original stereo music and a separate SFX stem.
    The bed changes energy by chapter so it never feels like one endless loop.
    """
    sr=48000
    n=int(round(duration*sr))
    music=np.zeros((n,2),dtype=np.float32)
    sfx=np.zeros((n,2),dtype=np.float32)
    rng=np.random.default_rng(20260920)

    bounds=[0.0]+list(chapter_times)+[duration]

    def add_sig(arr, at, sig, pan=0.5):
        a=max(0,int(round(at*sr)))
        if a>=n: return
        m=min(len(sig),n-a)
        if m<=0: return
        pan=max(0.0,min(1.0,pan))
        l=math.cos(pan*math.pi/2)
        r=math.sin(pan*math.pi/2)
        arr[a:a+m,0]+=sig[:m]*l
        arr[a:a+m,1]+=sig[:m]*r

    def tone(freq,length,amp=.03,decay=2.5,kind="sine"):
        m=max(1,int(length*sr)); tt=np.arange(m,dtype=np.float32)/sr
        if kind=="tri":
            sig=(2/np.pi)*np.arcsin(np.sin(2*np.pi*freq*tt))
        elif kind=="softsquare":
            sig=np.tanh(1.8*np.sin(2*np.pi*freq*tt))
        else:
            sig=np.sin(2*np.pi*freq*tt)
        env=np.exp(-tt*decay)
        return (sig*env*amp).astype(np.float32)

    def pad(chord,length,amp=.018):
        m=max(1,int(length*sr)); tt=np.arange(m,dtype=np.float32)/sr
        sig=np.zeros(m,dtype=np.float32)
        for j,f in enumerate(chord):
            sig += np.sin(2*np.pi*f*tt + j*.65).astype(np.float32)
            sig += .22*np.sin(2*np.pi*(f*2.0)*tt + j*.33).astype(np.float32)
        sig /= max(1,len(chord))
        attack=np.clip(tt/.75,0,1)
        release=np.clip((length-tt)/1.1,0,1)
        env=np.minimum(attack,release)
        return (sig*env*amp).astype(np.float32)

    def noise_hit(length=.12,amp=.02,bright=True):
        m=max(1,int(length*sr)); tt=np.arange(m,dtype=np.float32)/sr
        z=rng.standard_normal(m).astype(np.float32)
        if bright:
            z=np.concatenate([[0],np.diff(z)]).astype(np.float32)
        env=np.exp(-tt*(35 if bright else 16))
        return (z*env*amp).astype(np.float32)

    progressions=[
        [(110.00,138.59,164.81),(98.00,123.47,146.83),(130.81,164.81,196.00),(87.31,110.00,130.81)],
        [(130.81,164.81,196.00),(110.00,146.83,174.61),(146.83,185.00,220.00),(98.00,130.81,164.81)],
    ]

    for sec in range(len(bounds)-1):
        st,en=bounds[sec],bounds[sec+1]
        if en<=st: continue
        serious = sec in (8,9)
        tech = sec in (4,5,6)
        finalish = sec >= 10
        bpm = 82 if serious else (108 if tech else (102 if finalish else 96))
        beat=60.0/bpm
        chord_len=beat*8
        prog=progressions[1 if tech else 0]

        # pads
        ci=0; t0=st
        while t0<en:
            L=min(chord_len,en-t0)
            ps=pad(prog[ci%len(prog)],L,amp=.013 if serious else .017)
            add_sig(music,t0,ps,pan=.32 if ci%2==0 else .68)
            t0+=L; ci+=1

        # rhythm + bass + arpeggio
        b=0; t0=st
        notes=[0,2,1,2,0,1,2,1]
        while t0<en:
            chord=prog[(b//8)%len(prog)]
            # warm bass on quarter notes
            if b%2==0:
                add_sig(music,t0,tone(chord[0]/2,.55,.018 if serious else .025,4.2,"sine"),.50)
            # kick/snare/hats; lighter in serious chapters
            if b%4 in (0,):
                k=tone(64,.20,.035 if not serious else .020,14.0,"sine")
                add_sig(music,t0,k,.50)
            if b%4==2 and not serious:
                add_sig(music,t0,noise_hit(.16,.012,False),.50)
            if not serious or b%2==0:
                add_sig(music,t0+beat*.5,noise_hit(.055,.006 if serious else .009,True),.78 if b%4<2 else .22)
            # short pluck arpeggio; more present in tech chapters
            nf=chord[notes[b%len(notes)]%len(chord)]*2
            amp=.010 if serious else (.021 if tech else .014)
            add_sig(music,t0+beat*.25,tone(nf,.28,amp,8.0,"tri"),.28 if b%2==0 else .72)
            t0+=beat; b+=1

    # chapter transition whooshes + chimes
    for at in chapter_times:
        L=.70; m=int(L*sr); tt=np.arange(m,dtype=np.float32)/sr
        z=rng.standard_normal(m).astype(np.float32)
        env=(np.clip(tt/.35,0,1)*np.clip((L-tt)/.22,0,1))
        whoosh=z*env*.018
        add_sig(sfx,max(0,at-.35),whoosh,.5)
        add_sig(sfx,at,tone(880,.45,.060,6.5,"sine"),.42)
        add_sig(sfx,at+.03,tone(1320,.33,.035,8.0,"sine"),.62)

    for i,at in enumerate(accent_times):
        add_sig(sfx,at,tone(1040,.24,.045,10.0,"tri"),.35 if i%2==0 else .65)

    # Gentle master normalization, preserving headroom for narration later.
    mp=float(np.max(np.abs(music))) if len(music) else 1.0
    sp=float(np.max(np.abs(sfx))) if len(sfx) else 1.0
    if mp>0: music*=min(1.0,.20/mp)
    if sp>0: sfx*=min(1.0,.28/sp)
    sf.write(bg_path,music,sr)
    sf.write(se_path,sfx,sr)


def stamp(t):
    h=int(t//3600); m=int((t%3600)//60); s=t%60; return f"{h:02d}:{m:02d}:{s:06.3f}".replace(".",",")


def ass_time(t):
    h=int(t//3600); m=int((t%3600)//60); s=t%60
    return f"{h}:{m:02d}:{s:05.2f}"

def split_caption_phrases(text, target=16, maxlen=24):
    """Split captions on Japanese token / grammatical boundaries.

    Never cut inside a Japanese lexical token or an English/ASCII phrase.
    Keep Japanese commas for readability; drop only terminal full stops.
    """
    text=text.strip()
    if not text:
        return []

    ascii_pat=re.compile(r"[A-Za-z0-9.+/:-]+(?:[ \u3000]+[A-Za-z0-9.+/:-]+)*")

    def tokenize_mixed(segment):
        out=[]
        pos=0
        for m in ascii_pat.finditer(segment):
            if m.start()>pos:
                for tok in JP_TOKENIZER.tokenize(segment[pos:m.start()]):
                    if tok.surface:
                        out.append((tok.surface, tok.part_of_speech.split(",")[0], False))
            out.append((m.group(0), "ASCII", True))
            pos=m.end()
        if pos<len(segment):
            for tok in JP_TOKENIZER.tokenize(segment[pos:]):
                if tok.surface:
                    out.append((tok.surface, tok.part_of_speech.split(",")[0], False))
        return out

    def boundary_rank(tok):
        surf,pos,protected=tok
        if surf in ("。","！","？","!","?"):
            return 0.0
        if surf in ("、","，",",","：",":","；",";"):
            return 0.3
        if pos=="接続詞":
            return 0.7
        if pos=="助詞":
            return 1.0
        if pos=="助動詞" and surf in ("だ","です","ます","た","ない","ぬ","たい","れる","られる"):
            return 1.5
        if protected:
            return 2.5
        return None

    pieces=[]
    # Keep punctuation in the source chunks.
    sentences=[p for p in re.split(r"(?<=[。！？!?])",text) if p]
    for sentence in sentences:
        toks=tokenize_mixed(sentence)
        i=0
        while i<len(toks):
            rem="".join(t[0] for t in toks[i:]).strip()
            if len(rem)<=maxlen:
                if rem:
                    pieces.append(rem.rstrip("。"))
                break

            total=0
            candidates=[]
            j=i
            while j<len(toks):
                total += len(toks[j][0])
                rank=boundary_rank(toks[j])
                if total>=7 and rank is not None:
                    candidates.append((abs(total-target)+rank*2.0,j,total))
                if total>=maxlen:
                    break
                j+=1

            if candidates:
                _,cut_j,_=min(candidates,key=lambda x:x[0])
            else:
                # Look a little farther for a grammatical boundary instead of
                # cutting a word in half.
                k=j+1
                far_total=total
                farther=[]
                while k<len(toks) and far_total<=maxlen+10:
                    far_total += len(toks[k][0])
                    rank=boundary_rank(toks[k])
                    if rank is not None:
                        farther.append((abs(far_total-target)+rank*2.0,k,far_total))
                    k+=1
                if farther:
                    _,cut_j,_=min(farther,key=lambda x:x[0])
                else:
                    # Absolute last resort: token boundary only.
                    cut_j=max(i,j-1 if j>i else j)

            phrase="".join(t[0] for t in toks[i:cut_j+1]).strip()
            if phrase:
                pieces.append(phrase.rstrip("。"))
            i=cut_j+1

    merged=[]
    for p in pieces:
        # Preserve comma punctuation and never merge over an explicit clause break.
        if merged and len(p)<=3 and not merged[-1].endswith(("、","，",",","！","？","!","?")) and len(merged[-1])+len(p)<=maxlen:
            merged[-1]+=p
        else:
            merged.append(p)

    return [p for p in merged if p] or [text.rstrip("。")]

ASS_COLORS={
    "SSD":"&H00FF8935&","NVMe":"&H00E0DC46&","M.2":"&H00FF8935&","NAND":"&H00FF8935&",
    "HDD":"&H00449EF6&","プラッタ":"&H00449EF6&","ヘッド":"&H00449EF6&","CMR":"&H00449EF6&","SMR":"&H00449EF6&",
    "TBW":"&H006758FF&","故障":"&H006758FF&","≠":"&H006758FF&",
    "3-2-1":"&H008FD250&","バックアップ":"&H008FD250&",
    "FPS":"&H00E0DC46&","RAM":"&H00E0DC46&"
}

def ass_escape(s):
    return s.replace("\\","\\\\").replace("{","(").replace("}",")")

def ass_highlight(s):
    # Phrase splitting already guarantees a short caption. Do not insert character-count
    # line breaks here, because that can split English words or Japanese compounds.
    s=ass_escape(s)
    keys=sorted(ASS_COLORS,key=len,reverse=True)
    pat=re.compile("|".join(re.escape(k) for k in keys))
    def repl(m):
        return "{\\c"+ASS_COLORS[m.group(0)]+"}"+m.group(0)+"{\\c&H00FFFFFF&}"
    return pat.sub(repl,s)

def make_ass(events,path):
    header="""[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
WrapStyle: 2
ScaledBorderAndShadow: yes
YCbCr Matrix: TV.709

[V4+ Styles]
Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding
Style: Main,Noto Sans CJK JP,68,&H00FFFFFF,&H00FFFFFF,&H00101010,&H70000000,-1,0,0,0,100,100,1,0,1,7,3,2,90,90,82,1

[Events]
Format: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text
"""
    lines=[header]
    for st,en,phrase in events:
        txt=ass_highlight(phrase)
        tags="{\\fad(65,75)\\fscx94\\fscy94\\t(0,120,\\fscx100\\fscy100)}"
        lines.append(f"Dialogue: 0,{ass_time(st)},{ass_time(en)},Main,,0,0,0,,{tags}{txt}\n")
    Path(path).write_text("".join(lines),encoding="utf-8-sig")

clips=[]; subs=[]; caption_events=[]; chapter_lines=[]; chapter_times=[]; accent_times=[]; current=0.0; idx=0
for sec_i,(title,sents) in enumerate(SECTIONS):
    if sec_i>0:
        chapter_times.append(current); clips.append(title_segment(title,sec_i)); current+=1.3
    chapter_lines.append(f"{int(current//60):02d}:{int(current%60):02d} {title}")
    for s in sents:
        wav=WORK/f"voice_{idx:04d}.wav"; tts(s,wav); voice48=read_voice_48k(wav,.10); duration=len(voice48)/48000.0
        kind=scene_kind(title,s); seg=render_segment(title,s,kind,wav,duration,idx); clips.append(seg)
        st=current; en=current+duration; subs.append((idx+1,st,en,s))
        phrases=split_caption_phrases(s)
        weights=[max(4,len(re.sub(r"[、。！？!? ]","",p))) for p in phrases]
        totalw=sum(weights) or 1
        cursor=st
        for pi,(p,wgt) in enumerate(zip(phrases,weights)):
            pend=en if pi==len(phrases)-1 else cursor+duration*(wgt/totalw)
            caption_events.append((cursor,min(en,pend),p))
            cursor=pend
        current=en
        if any(k in s for k in ["M.2","TBW","FPS","3-2-1","使い分け"]): accent_times.append(st+.15)
        idx+=1
im=bg_image("",""); d=ImageDraw.Draw(im,"RGBA"); txt(d,(1440,870),'次回「SSDとHDDの歴史」',48,WHITE,"mm")
p=save(im,"next.png"); outro=WORK/"outro.mp4"
run(["ffmpeg","-y","-loglevel","error","-loop","1","-i",p,"-t","8","-vf",f"scale={W}:{H},fade=t=in:st=4:d=1,format=yuv420p","-r",str(FPS),"-an","-c:v","libx264","-preset","veryfast","-crf","17",outro]); clips.append(outro); current+=8
concat=WORK/"concat.txt"; concat.write_text("\n".join(f"file '{x.resolve()}'" for x in clips),encoding="utf-8")
base=WORK/"base.mp4"; run(["ffmpeg","-y","-loglevel","error","-f","concat","-safe","0","-i",concat,"-c","copy",base])
ass_path=OUT/"subtitles.ass"; make_ass(caption_events,ass_path)
bg=OUT/"bgm_stem.wav"; se=OUT/"se_stem.wav"; bgm_with_sfx(current,chapter_times,accent_times,bg,se)
mix=WORK/"bgm_se_mix.wav"
run(["ffmpeg","-y","-loglevel","error","-i",bg,"-i",se,"-filter_complex","[0:a]volume=1.0[b];[1:a]volume=1.0[s];[b][s]amix=inputs=2:duration=longest:dropout_transition=0:normalize=0,loudnorm=I=-27:TP=-6:LRA=10,aresample=48000[m]","-map","[m]","-ar","48000","-c:a","pcm_s24le",mix])
mix_out=OUT/"bgm_se_mix.wav"; run(["ffmpeg","-y","-loglevel","error","-i",mix,"-c:a","pcm_s24le","-ar","48000",mix_out])
clean=OUT/"SSD_HDD_CLEAN_NO_NARRATION.mp4"
run(["ffmpeg","-y","-loglevel","error","-i",base,"-i",mix,"-map","0:v","-map","1:a","-t",f"{current:.3f}","-c:v","copy","-c:a","aac","-ar","48000","-b:a","256k","-movflags","+faststart",clean])
final=OUT/"SSD_HDD_MASTER_NO_NARRATION.mp4"
ass_filter=f"ass={ass_path.as_posix()}:fontsdir=/usr/share/fonts/opentype/noto"
run(["ffmpeg","-y","-loglevel","error","-i",base,"-i",mix,"-vf",ass_filter,"-map","0:v","-map","1:a","-t",f"{current:.3f}","-c:v","libx264","-preset","medium","-b:v","10M","-minrate","10M","-maxrate","10M","-bufsize","20M","-x264-params","nal-hrd=cbr:force-cfr=1","-pix_fmt","yuv420p","-c:a","aac","-ar","48000","-b:a","256k","-movflags","+faststart",final])
run(["ffmpeg","-y","-loglevel","error","-i",final,"-vf","scale=1280:720","-c:v","libx264","-preset","veryfast","-crf","21","-c:a","aac","-b:a","160k",OUT/"SSD_HDD_PREVIEW_NO_NARRATION.mp4"])
with open(OUT/"subtitles.srt","w",encoding="utf-8") as f:
    for n,(st,en,p) in enumerate(caption_events,1): f.write(f"{n}\n{stamp(st)} --> {stamp(en)}\n{p}\n\n")
(OUT/"chapters.txt").write_text("\n".join(chapter_lines),encoding="utf-8")
print("DONE",final,"duration",current,"sentences",idx)
