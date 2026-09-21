#!/usr/bin/env python3
from __future__ import annotations
import csv, json, math, re, subprocess, sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
from janome.tokenizer import Tokenizer

W,H,FPS=1920,1080,60
ROOT=Path(__file__).resolve().parent
ASSET_DIR=Path("real_assets")
VOICE_DIR=Path("voice")
OUT=Path("real_video_output")
WORK=Path("/tmp/ssd_hdd_real_render")
OUT.mkdir(exist_ok=True)
WORK.mkdir(exist_ok=True)

FONT_BOLD="/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc"
FONT_REG="/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"
JP=Tokenizer()

def run(cmd):
    cmd=list(map(str,cmd))
    print("+"," ".join(cmd),flush=True)
    subprocess.run(cmd,check=True)

def asset(asset_id):
    xs=[p for p in ASSET_DIR.glob(asset_id+".*") if p.is_file()]
    if not xs:
        raise FileNotFoundError(asset_id)
    return sorted(xs)[0]

def optional_asset(asset_id):
    xs=[p for p in ASSET_DIR.glob(asset_id+".*") if p.is_file()]
    return sorted(xs)[0] if xs else None

def probe_duration(path):
    s=subprocess.check_output([
        "ffprobe","-v","error","-show_entries","format=duration",
        "-of","default=nw=1:nk=1",str(path)
    ],text=True).strip()
    return float(s)

def read_timestamps():
    p=VOICE_DIR/"narration_timestamps.tsv"
    rows=[]
    with p.open(encoding="utf-8") as f:
        r=csv.DictReader(f,delimiter="\t")
        for x in r:
            rows.append({
                "idx":int(x["index"]),"st":float(x["start"]),"en":float(x["end"]),
                "section":x["section"],"text":x["text"]
            })
    return rows

def semantic_phrases(text,maxlen=24):
    # Caption splitting: token boundaries only, never cut English acronyms or Japanese words in half.
    ascii_pat=re.compile(r"[A-Za-z0-9.+/:-]+(?:[ \u3000]+[A-Za-z0-9.+/:-]+)*")
    toks=[]; pos=0
    for m in ascii_pat.finditer(text):
        if m.start()>pos:
            for t in JP.tokenize(text[pos:m.start()]):
                if t.surface: toks.append((t.surface,t.part_of_speech.split(",")[0]))
        toks.append((m.group(0),"ASCII")); pos=m.end()
    if pos<len(text):
        for t in JP.tokenize(text[pos:]):
            if t.surface: toks.append((t.surface,t.part_of_speech.split(",")[0]))
    out=[]; cur=""
    for surf,pos in toks:
        candidate=cur+surf
        boundary = surf in "、。！？!?" or pos in ("助詞","接続詞")
        if len(candidate)>maxlen and cur:
            out.append(cur.rstrip("。")); cur=surf
        else:
            cur=candidate
        if boundary and len(cur)>=10:
            out.append(cur.rstrip("。")); cur=""
    if cur: out.append(cur.rstrip("。"))
    # merge tiny pieces
    merged=[]
    for p in out:
        if merged and len(p)<=4 and len(merged[-1])+len(p)<=maxlen:
            merged[-1]+=p
        else: merged.append(p)
    return [x for x in merged if x] or [text.rstrip("。")]

def ass_time(t):
    cs=round(t*100); h=cs//360000; cs%=360000; m=cs//6000; cs%=6000; s=cs//100; cs%=100
    return f"{h}:{m:02d}:{s:02d}.{cs:02d}"

HILITE={
 "SSD":"&H0048F285&","NVMe":"&H00FFE15C&","M.2":"&H0048F285&","NAND":"&H0048F285&",
 "HDD":"&H0056B9FF&","プラッタ":"&H0056B9FF&","ヘッド":"&H0056B9FF&",
 "TBW":"&H00646AFF&","故障":"&H00646AFF&","3-2-1":"&H0048F285&","バックアップ":"&H0048F285&"
}
def ass_markup(s):
    s=s.replace("\\","\\\\").replace("{","(").replace("}",")")
    pat=re.compile("|".join(re.escape(k) for k in sorted(HILITE,key=len,reverse=True)))
    return pat.sub(lambda m:"{\\c"+HILITE[m.group(0)]+"}"+m.group(0)+"{\\c&H008DFF71&}",s)

def make_ass(rows,path):
    events=[]
    for row in rows:
        ps=semantic_phrases(row["text"])
        weights=[max(3,len(re.sub(r"[\s、。！？!?]","",p))) for p in ps]
        sw=sum(weights); cur=row["st"]
        for i,(p,w) in enumerate(zip(ps,weights)):
            en=row["en"] if i==len(ps)-1 else cur+(row["en"]-row["st"])*w/sw
            events.append((cur,en,p)); cur=en
    header="""[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
WrapStyle: 2
ScaledBorderAndShadow: yes
YCbCr Matrix: TV.709

[V4+ Styles]
Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding
Style: Main,Noto Sans CJK JP,86,&H008DFF71,&H008DFF71,&H00101010,&H80000000,-1,0,0,0,100,100,0,0,1,9,4,2,80,80,68,1

[Events]
Format: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text
"""
    with Path(path).open("w",encoding="utf-8-sig") as f:
        f.write(header)
        for st,en,s in events:
            tags="{\\fad(55,65)\\fscx94\\fscy94\\t(0,100,\\fscx100\\fscy100)}"
            f.write(f"Dialogue: 0,{ass_time(st)},{ass_time(en)},Main,,0,0,0,,{tags}{ass_markup(s)}\n")

def pool_for(section,text):
    sec=section
    if "HDDとは" in sec:
        if "ヘッド" in text: return ["hdd_head_macro","hdd_working_video","hdd_open_photo"]
        if "プラッタ" in text: return ["hdd_open_photo","hdd_working_video","hdd_head_macro"]
        return ["hdd_working_video","hdd_open_photo","hdd_side","hdd_head_macro"]
    if "SSDとは" in sec:
        if "NAND" in text: return ["ssd_nand","ssd_controller","sata_ssd","nvme_m2"]
        return ["ssd_controller","ssd_nand","sata_ssd","nvme_m2","computer_components_video"]
    if "何が違う" in sec:
        return ["hdd_open_photo","sata_ssd","hdd_head_macro","nvme_m2","motherboard"]
    if "速度" in sec:
        return ["browser_demo_video","computer_components_video","nvme_m2","m2_installed","sata_ssd","hdd_working_video"]
    if "種類" in sec:
        return ["sata_ssd","nvme_m2","m2_installed","sata_vs_nvme","sata_connector","sata_data_power","hdd_side","ssd_controller"]
    if "容量" in sec:
        return ["hdd_side","external_hdds","external_ssd","external_hdd_usb_box","sata_ssd","nas","server_rack","nvme_m2"]
    if "寿命" in sec:
        return ["ssd_nand","ssd_controller","hdd_head_macro","hdd_open_photo"]
    if "バックアップ" in sec:
        return ["nas","server_rack","motherboard","sata_ssd"]
    if "用途" in sec:
        return ["motherboard","pc_m2_hdd_inside","ssd_install","m2_installed","nas","server_rack","browser_demo_video","nvme_m2","external_ssd","external_hdds"]
    if "最終" in sec:
        return ["nvme_m2","hdd_open_photo","sata_ssd","nas","motherboard"]
    if "第1章" in sec:
        return ["ram_ddr4","motherboard","pc_m2_hdd_inside","ssd_install","sata_ssd","hdd_side","browser_demo_video"]
    return ["hdd_open_photo","sata_ssd","nvme_m2","motherboard","zundamon_official"]

def is_video(p):
    return p.suffix.lower() in (".mp4",".webm",".mov",".mkv")

def create_overlay(row,slot,path):
    # Context-specific explanatory graphics. Real media remains the main picture.
    im=Image.new("RGBA",(W,H),(0,0,0,0)); d=ImageDraw.Draw(im,"RGBA")
    fb=ImageFont.truetype(FONT_BOLD,42); fs=ImageFont.truetype(FONT_BOLD,32)
    # top section pill
    title=row["section"].split("　",1)[-1]
    d.rounded_rectangle((42,38,730,112),radius=24,fill=(6,13,20,190),outline=(135,255,113,190),width=3)
    d.text((66,74),title,font=fb,fill=(230,255,230,255),anchor="lm")
    t=row["text"]
    # draw focused explanatory overlays only when useful
    if "プラッタ" in t or "ヘッド" in t:
        d.rounded_rectangle((70,180,530,355),radius=25,fill=(5,10,18,195))
        d.text((100,225),"HDD内部",font=fb,fill=(255,185,80,255))
        d.text((100,290),"プラッタ  /  ヘッド",font=fs,fill=(255,255,255,255))
    elif "NAND" in t or "コントローラー" in t:
        d.rounded_rectangle((70,180,620,355),radius=25,fill=(5,10,18,195))
        d.text((100,225),"SSD内部",font=fb,fill=(100,210,255,255))
        d.text((100,290),"NAND  +  Controller",font=fs,fill=(255,255,255,255))
    elif "M.2" in t or "NVMe" in t:
        d.rounded_rectangle((70,180,600,345),radius=25,fill=(5,10,18,195))
        d.text((100,230),"M.2 ≠ NVMe",font=fb,fill=(141,255,113,255))
        d.text((100,292),"形状 と 通信規格",font=fs,fill=(255,255,255,255))
    elif "ランダム" in t or "シーケンシャル" in t:
        d.rounded_rectangle((70,180,650,365),radius=25,fill=(5,10,18,195))
        d.text((100,228),"Sequential / Random",font=fb,fill=(141,255,113,255))
        for i in range(9):
            x=108+i*52
            col=(100,210,255,255) if "シーケンシャル" in t else ((255,185,80,255) if i%3 else (100,210,255,255))
            d.rounded_rectangle((x,290,x+36,326),radius=5,fill=col)
    elif "3-2-1" in t or "バックアップ" in row["section"]:
        d.rounded_rectangle((70,180,690,360),radius=25,fill=(5,10,18,195))
        d.text((100,230),"3 - 2 - 1 BACKUP",font=fb,fill=(141,255,113,255))
        d.text((100,300),"3 copies   2 media   1 off-site",font=fs,fill=(255,255,255,255))
    elif "TBW" in t:
        d.rounded_rectangle((70,180,620,345),radius=25,fill=(5,10,18,195))
        d.text((100,230),"TBW",font=fb,fill=(255,100,100,255))
        d.text((100,292),"耐久性の目安 ≠ 壊れる瞬間",font=fs,fill=(255,255,255,255))
    im.save(path)

def fit_image_filter():
    return f"scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H}"

def render_event(ev,out,zundamon):
    dur=ev["en"]-ev["st"]
    src=asset(ev["asset"])
    overlay=WORK/f"ov_{ev['n']:04d}.png"
    create_overlay(ev["row"],ev["slot"],overlay)
    pos_right=(ev["n"]//3)%2==0
    zx="W-w-30" if pos_right else "30"
    zy="H-h-16+6*sin(2*PI*t/1.8)"
    # Make actual source the dominant frame. Images get a subtle Ken Burns zoom.
    if is_video(src):
        srcdur=probe_duration(src)
        seek=(ev["n"]*3.7)%max(0.1,srcdur-1.0)
        base_inputs=["-stream_loop","-1","-ss",f"{seek:.2f}","-i",src]
        base_filter=f"[0:v]{fit_image_filter()},fps={FPS},setsar=1[base]"
    else:
        base_inputs=["-loop","1","-framerate",str(FPS),"-i",src]
        # Slow zoom, never a static still.
        base_filter=f"[0:v]scale=2100:-1:force_original_aspect_ratio=increase,zoompan=z='min(zoom+0.00035,1.08)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s={W}x{H}:fps={FPS},setsar=1[base]"
    cmd=["ffmpeg","-y","-loglevel","error",*base_inputs,
         "-loop","1","-i",overlay,
         "-loop","1","-i",zundamon]
    # darken slightly only behind overlays/captions; actual media stays visible
    fc=[
      base_filter,
      "[base]drawbox=x=0:y=0:w=iw:h=ih:color=black@0.10:t=fill[b0]",
      f"[1:v]format=rgba[ov];[b0][ov]overlay=0:0[b1]",
      "[2:v]format=rgba,scale=-1:390[z]",
      f"[b1][z]overlay=x='{zx}':y='{zy}':format=auto,fade=t=in:st=0:d=.10,fade=t=out:st={max(0,dur-.10):.3f}:d=.10,format=yuv420p[v]"
    ]
    cmd += ["-filter_complex",";".join(fc),"-map","[v]","-t",f"{dur:.3f}","-r",str(FPS),
            "-an","-c:v","libx264","-preset","ultrafast","-crf","15",out]
    run(cmd)

def make_bgm(total):
    tracks=[optional_asset("bgm_mellowtron"),optional_asset("bgm_pamgaea"),optional_asset("bgm_envision")]
    tracks=[x for x in tracks if x]
    out=WORK/"bgm.wav"
    if not tracks:
        # fallback only if external BGM unavailable
        run(["ffmpeg","-y","-f","lavfi","-i","anullsrc=r=48000:cl=stereo","-t",str(total),out])
        return out
    # 3 mood blocks across the whole video; loop each licensed track as needed.
    thirds=[0,total*.34,total*.70,total]
    segs=[]
    for i in range(3):
        tr=tracks[min(i,len(tracks)-1)]
        p=WORK/f"bgm_{i}.wav"; length=thirds[i+1]-thirds[i]
        run(["ffmpeg","-y","-loglevel","error","-stream_loop","-1","-i",tr,
             "-t",f"{length:.3f}","-af","afade=t=in:st=0:d=1,afade=t=out:st="+f"{max(0,length-1):.3f}"+":d=1,volume=-20dB",
             "-ar","48000","-ac","2","-c:a","pcm_s16le",p])
        segs.append(p)
    lst=WORK/"bgm_concat.txt"; lst.write_text("\n".join(f"file '{p.resolve()}'" for p in segs),encoding="utf-8")
    run(["ffmpeg","-y","-loglevel","error","-f","concat","-safe","0","-i",lst,"-c:a","pcm_s16le",out])
    return out

rows=read_timestamps()
voice=VOICE_DIR/"SSD_HDD_NARRATION_ZUNDAMON_48k.wav"
total=probe_duration(voice)
zundamon=asset("zundamon_official")

# Build global subtitles from the corrected narration timings.
ass=OUT/"subtitles_green.ass"
make_ass(rows,ass)

events=[]; n=0; last_asset=None; cur=0.0
for row in rows:
    if row["st"]>cur+0.02:
        # chapter gap: 1.3s title beat, use a relevant real asset rather than a blank screen.
        pool=pool_for(row["section"],row["text"])
        a=next((x for x in pool if optional_asset(x) and x!=last_asset),next((x for x in pool if optional_asset(x)),None))
        if a:
            events.append({"n":n,"st":cur,"en":row["st"],"asset":a,"slot":0,"row":row}); n+=1; last_asset=a
    dur=row["en"]-row["st"]
    slots=max(1,math.ceil(dur/3.6))
    pool=[x for x in pool_for(row["section"],row["text"]) if optional_asset(x)]
    if not pool:
        pool=["zundamon_official"]
    for s in range(slots):
        st=row["st"]+dur*s/slots; en=row["st"]+dur*(s+1)/slots
        choices=[x for x in pool if x!=last_asset] or pool
        a=choices[(row["idx"]+s)%len(choices)]
        events.append({"n":n,"st":st,"en":en,"asset":a,"slot":s,"row":row}); n+=1; last_asset=a
    cur=row["en"]

# final 8 sec: actual hardware montage in 2-second cuts, then next-video title.
ending_row={"section":"次回","text":"次回 SSDとHDDの歴史","idx":9999}
for a in [x for x in ["hdd_open_photo","ssd_controller","nvme_m2","sata_ssd"] if optional_asset(x)]:
    if cur>=total: break
    en=min(total,cur+2.0)
    events.append({"n":n,"st":cur,"en":en,"asset":a,"slot":0,"row":ending_row}); n+=1; cur=en
if cur<total:
    a=next((x for x in ["nvme_m2","sata_ssd","hdd_open_photo"] if optional_asset(x)),"zundamon_official")
    events.append({"n":n,"st":cur,"en":total,"asset":a,"slot":0,"row":ending_row})

# QA guard: no visual event longer than 4.05 s except if total ending cannot be split.
too_long=[e for e in events if e["en"]-e["st"]>4.05]
if too_long:
    raise RuntimeError("visual hold exceeds 4.05s: "+repr([(e["n"],e["en"]-e["st"]) for e in too_long[:10]]))

with (OUT/"storyboard.tsv").open("w",encoding="utf-8") as f:
    f.write("n\tstart\tend\tduration\tasset\tsection\ttext\n")
    for e in events:
        f.write(f"{e['n']}\t{e['st']:.3f}\t{e['en']:.3f}\t{e['en']-e['st']:.3f}\t{e['asset']}\t{e['row']['section']}\t{e['row']['text']}\n")

clips=[]
for e in events:
    p=WORK/f"clip_{e['n']:04d}.mp4"
    render_event(e,p,zundamon)
    clips.append(p)

concat=WORK/"video_concat.txt"
concat.write_text("\n".join(f"file '{p.resolve()}'" for p in clips),encoding="utf-8")
visual=WORK/"visual.mp4"
run(["ffmpeg","-y","-loglevel","error","-f","concat","-safe","0","-i",concat,"-c","copy",visual])

bgm=make_bgm(total)
final=OUT/"SSD_HDD_REAL_MEDIA_FINAL.mp4"
# External BGM under narration, soft chapter SFX synthesized only as accents.
run([
  "ffmpeg","-y","-loglevel","error","-i",visual,"-i",voice,"-i",bgm,
  "-filter_complex",
  f"[0:v]ass={ass.as_posix()}:fontsdir=/usr/share/fonts/opentype/noto[v];"
  "[1:a]volume=1.0[n];[2:a]volume=1.0[b];"
  "[n][b]amix=inputs=2:duration=first:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=9[a]",
  "-map","[v]","-map","[a]","-t",f"{total:.3f}",
  "-c:v","libx264","-preset","medium","-b:v","10M","-maxrate","12M","-bufsize","24M",
  "-pix_fmt","yuv420p","-c:a","aac","-ar","48000","-b:a","256k","-movflags","+faststart",final
])

# Preview and QA frames.
preview=OUT/"SSD_HDD_REAL_MEDIA_PREVIEW_720p.mp4"
run(["ffmpeg","-y","-loglevel","error","-i",final,"-vf","scale=1280:720","-c:v","libx264","-preset","veryfast","-crf","22","-c:a","aac","-b:a","160k",preview])
for t in [15,90,180,300,420,540,660,780,900,1020,1140]:
    run(["ffmpeg","-y","-loglevel","error","-ss",str(t),"-i",final,"-frames:v","1",OUT/f"frame_{t}.png"])

# copy credits alongside final
attr=ASSET_DIR/"ATTRIBUTION.md"
if attr.exists():
    (OUT/"ATTRIBUTION.md").write_text(attr.read_text(encoding="utf-8"),encoding="utf-8")
print("events",len(events),"duration",total,"final",final)
