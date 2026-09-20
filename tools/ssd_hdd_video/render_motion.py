#!/usr/bin/env python3
from __future__ import annotations
import ast, math, os, re, subprocess, wave
from pathlib import Path
import requests
import numpy as np
import soundfile as sf
from PIL import Image, ImageDraw, ImageFont, ImageFilter

W,H,FPS = 1920,1080,30
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

_grad = np.linspace(np.array(BG0,dtype=np.float32), np.array(BG1,dtype=np.float32), H, dtype=np.float32)[:,None,:]
_grad = np.repeat(_grad, W, axis=1).astype(np.uint8)
BASE_BG = Image.fromarray(_grad, "RGB")

def bg_image(title, caption=""):
    im=BASE_BG.copy()
    d=ImageDraw.Draw(im,"RGBA")
    for x in range(90,W,120): d.line((x,210,x,H-110),fill=(255,255,255,7),width=1)
    for y in range(240,H-110,120): d.line((70,y,W-70,y),fill=(255,255,255,7),width=1)
    txt(d,(100,76),title,36,MUTED,"la")
    d.line((100,132,430,132),fill=CYAN,width=3)
    if caption:
        rr(d,(260,858,1660,992),30,(4,8,18,220),outline=(255,255,255,22),width=2)
        lines=[caption[i:i+27] for i in range(0,len(caption),27)][:2]
        y0=900 if len(lines)==1 else 884
        for line in lines:
            txt(d,(960,y0),line,44,WHITE,"ma",True); y0+=54
    return im

def short_caption(s):
    rules=[
        ("電源を切", "電源を切ってもデータは残る"),
        ("RAM", "RAM = 作業中　/　SSD・HDD = 保存"),
        ("メモリ", "メモリとストレージは役割が違う"),
        ("プラッタ", "HDD = 回転する磁気ディスク"),
        ("ヘッド", "ヘッドが物理的に移動してデータを探す"),
        ("NAND", "SSD = NANDフラッシュ + コントローラー"),
        ("機械的な移動", "SSDにはHDDのような物理的な待ち時間がない"),
        ("動作音", "HDDは機械音あり / SSDは機械音なし"),
        ("衝撃", "可動部品の有無が衝撃耐性にも影響"),
        ("シーケンシャル", "大きなデータを順番に読む"),
        ("ランダム", "細かなデータをいろいろな場所から読む"),
        ("FPS", "ロード時間 ≠ FPS"),
        ("M.2", "M.2 ≠ NVMe"),
        ("NVMe", "M.2は形 / NVMeは通信仕様"),
        ("TLC", "TLC = 1セル3bit / QLC = 1セル4bit"),
        ("QLC", "NANDの種類だけでSSD全体の性能は決まらない"),
        ("CMR", "CMRとSMRは記録方式が違う"),
        ("SMR", "SMRは高密度化しやすいが書き換えに特徴がある"),
        ("容量あたり", "大容量になるほど1TBあたりの価格が重要"),
        ("TBW", "TBW ≠ 壊れる瞬間"),
        ("永久", "SSDもHDDも永久ではない"),
        ("3-2-1", "3コピー・2種類・1つは別の場所"),
        ("一台が壊", "重要なのは『1台壊れても残る状態』"),
        ("Windows", "OS・アプリはSSDと相性がいい"),
        ("動画編集", "作業中はSSD / 大量保管はHDD"),
        ("NAS", "大容量のNASではHDDの強みを活かしやすい"),
        ("USB", "外付けSSDは接続規格も重要"),
        ("完全に上", "勝ち負けではなく、用途で使い分ける"),
        ("使い分け", "SSD + HDD という選択肢"),
    ]
    for k,v in rules:
        if k in s: return v
    x=s.replace("なのだ。","").replace("のだ。","").replace("なのだ","").replace("のだ","")
    x=re.sub(r"^[、。\s]+|[、。\s]+$","",x)
    return x[:34] + ("…" if len(x)>34 else "")

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
    im=bg_image(title,short_caption(s)); d=ImageDraw.Draw(im,"RGBA")
    if kind=="storage":
        rr(d,(260,300,790,700),34,(20,34,58,235),outline=CYAN,width=4)
        rr(d,(1130,300,1660,700),34,(20,34,58,235),outline=SSD,width=4)
        txt(d,(525,400),"RAM",62,CYAN,"mm"); txt(d,(1395,400),"SSD / HDD",58,SSD,"mm")
        txt(d,(525,535),"作業中",42,WHITE,"mm"); txt(d,(1395,535),"保存",42,WHITE,"mm")
        txt(d,(960,520),"≠",76,MUTED,"mm")
    elif kind=="ssd":
        rr(d,(610,290,1310,735),40,(15,54,60,240),outline=SSD,width=6)
        txt(d,(960,345),"SSD",54,SSD,"mm")
        for x,y in [(760,470),(1160,470),(760,620),(1160,620)]:
            rr(d,(x-115,y-60,x+115,y+60),14,(26,35,50),outline=(70,97,118),width=3); txt(d,(x,y),"NAND",30,WHITE,"mm")
        rr(d,(870,500,1050,610),16,(27,82,112),outline=CYAN,width=4); txt(d,(960,555),"CTRL",30,CYAN,"mm")
    elif kind=="compare":
        txt(d,(500,260),"HDD",48,HDD,"mm"); txt(d,(1420,260),"SSD",48,SSD,"mm"); txt(d,(960,265),"VS",38,MUTED,"mm")
        d.line((960,300,960,760),fill=(255,255,255,26),width=2)
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
    cmd=["ffmpeg","-y","-loglevel","error",*inputs,"-i",str(wav),"-filter_complex",";".join(fc),"-map","[v]","-map",f"{n}:a","-t",f"{dur:.3f}","-r",str(FPS),"-c:v","libx264","-preset","veryfast","-crf","17","-c:a","aac","-b:a","192k","-shortest",str(out)]
    run(cmd); return out

def title_segment(title,secidx):
    im=bg_image("",""); d=ImageDraw.Draw(im,"RGBA"); txt(d,(960,430),title,72,WHITE,"mm"); txt(d,(960,540),"SSD / HDD",34,CYAN,"mm"); d.line((620,610,1300,610),fill=CYAN,width=5)
    p=save(im,f"title_{secidx:02d}.png"); out=WORK/f"title_{secidx:02d}.mp4"
    run(["ffmpeg","-y","-loglevel","error","-loop","1","-i",p,"-loop","1","-i",SPR["scan"],"-f","lavfi","-i","anullsrc=r=48000:cl=stereo","-filter_complex",f"[1:v]format=rgba,colorchannelmixer=aa=0.42[s];[0:v][s]overlay=x='-120+mod(t*420,{W+240})':y=300,fade=t=in:st=0:d=0.25,fade=t=out:st=1.05:d=0.25,format=yuv420p[v]","-map","[v]","-map","2:a","-t","1.3","-r",str(FPS),"-c:v","libx264","-preset","veryfast","-crf","17","-c:a","aac","-b:a","160k","-shortest",out])
    return out

def bgm_with_sfx(duration,chapter_times,accent_times,path):
    sr=48000; n=int(duration*sr); t=np.arange(n)/sr; y=np.zeros(n,dtype=np.float32)
    chords=[(110,164.81,220),(98,146.83,196),(130.81,196,261.63),(87.31,130.81,174.61)]; block=8
    for i in range(int(duration//block)+1):
        a=int(i*block*sr); b=min(n,int((i+1)*block*sr)); tt=t[a:b]; c=chords[i%len(chords)]
        pad=sum(np.sin(2*np.pi*f*tt+j*.55) for j,f in enumerate(c))/3
        y[a:b]+=0.032*pad*(0.78+0.22*np.sin(2*np.pi*tt/block))
    for beat in np.arange(0,duration,2.0):
        a=int(beat*sr); L=min(n-a,int(.07*sr)); tt=np.arange(max(0,L))/sr
        if L>0: y[a:a+L]+=0.007*np.sin(2*np.pi*95*tt)*np.exp(-tt*35)
    def add_chime(at,freq=880,amp=.06,L=.28):
        a=int(at*sr); m=min(n-a,int(L*sr))
        if m<=0:return
        tt=np.arange(m)/sr; y[a:a+m]+=amp*np.sin(2*np.pi*freq*tt)*np.exp(-tt*8)
    for at in chapter_times: add_chime(at,700,.045,.35)
    for at in accent_times: add_chime(at,1040,.035,.20)
    sf.write(path,y,sr)

def stamp(t):
    h=int(t//3600); m=int((t%3600)//60); s=t%60; return f"{h:02d}:{m:02d}:{s:06.3f}".replace(".",",")

clips=[]; subs=[]; chapter_lines=[]; chapter_times=[]; accent_times=[]; current=0.0; idx=0
for sec_i,(title,sents) in enumerate(SECTIONS):
    if sec_i>0:
        chapter_times.append(current); clips.append(title_segment(title,sec_i)); current+=1.3
    chapter_lines.append(f"{int(current//60):02d}:{int(current%60):02d} {title}")
    for s in sents:
        wav=WORK/f"voice_{idx:04d}.wav"; tts(s,wav); duration=durwav(wav)+.10
        kind=scene_kind(title,s); seg=render_segment(title,s,kind,wav,duration,idx); clips.append(seg)
        st=current; en=current+duration; subs.append((idx+1,st,en,s)); current=en
        if any(k in s for k in ["M.2","TBW","FPS","3-2-1","使い分け"]): accent_times.append(st+.15)
        idx+=1
im=bg_image("",""); d=ImageDraw.Draw(im,"RGBA"); txt(d,(1440,870),'次回「SSDとHDDの歴史」',48,WHITE,"mm"); txt(d,(960,990),"VOICEVOX:ずんだもん",24,MUTED,"mm")
p=save(im,"next.png"); outro=WORK/"outro.mp4"
run(["ffmpeg","-y","-loglevel","error","-loop","1","-i",p,"-f","lavfi","-i","anullsrc=r=48000:cl=stereo","-t","8","-vf",f"scale={W}:{H},fade=t=in:st=4:d=1,format=yuv420p","-r",str(FPS),"-c:v","libx264","-preset","veryfast","-crf","17","-c:a","aac","-b:a","160k","-shortest",outro]); clips.append(outro); current+=8
concat=WORK/"concat.txt"; concat.write_text("\n".join(f"file '{x.resolve()}'" for x in clips),encoding="utf-8")
base=WORK/"base.mp4"; run(["ffmpeg","-y","-loglevel","error","-f","concat","-safe","0","-i",concat,"-c","copy",base])
bg=WORK/"bgm_sfx.wav"; bgm_with_sfx(current,chapter_times,accent_times,bg)
final=OUT/"ssd_hdd_motion_complete.mp4"
run(["ffmpeg","-y","-loglevel","error","-i",base,"-i",bg,"-filter_complex","[1:a]volume=0.20[bg];[0:a][bg]amix=inputs=2:duration=first:dropout_transition=2[a]","-map","0:v","-map","[a]","-c:v","libx264","-preset","slow","-b:v","14M","-maxrate","18M","-bufsize","36M","-pix_fmt","yuv420p","-c:a","aac","-b:a","256k","-movflags","+faststart",final])
run(["ffmpeg","-y","-loglevel","error","-i",final,"-vf","scale=1280:720","-c:v","libx264","-preset","veryfast","-crf","23","-c:a","aac","-b:a","160k",OUT/"ssd_hdd_motion_preview.mp4"])
run(["ffmpeg","-y","-loglevel","error","-i",base,"-vn","-c:a","pcm_s16le",OUT/"narration.wav"])
with open(OUT/"subtitles.srt","w",encoding="utf-8") as f:
    for n,st,en,s in subs: f.write(f"{n}\n{stamp(st)} --> {stamp(en)}\n{s}\n\n")
(OUT/"chapters.txt").write_text("\n".join(chapter_lines),encoding="utf-8")
print("DONE",final,"duration",current,"sentences",idx)
