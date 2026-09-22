#!/usr/bin/env python3
from __future__ import annotations
import csv, json, math, os, re, subprocess, sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageOps
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

def prepare_zundamon(src):
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

def _fit_photo(path,size):
    im=Image.open(path).convert("RGB")
    return ImageOps.fit(im,size,method=Image.Resampling.LANCZOS,centering=(0.5,0.5))

def make_ssd_hdd_compare(n):
    """Create a real-photo split screen whenever narration mentions both SSD and HDD."""
    hdd_ids=["hdd_side","hdd_open_photo","hdd_head_macro"]
    ssd_ids=["sata_ssd","nvme_m2","ssd_controller"]

    hp=[optional_asset(x) for x in hdd_ids]
    sp=[optional_asset(x) for x in ssd_ids]
    hp=[x for x in hp if x]
    sp=[x for x in sp if x]
    if not hp or not sp:
        raise RuntimeError("SSD/HDD comparison photos unavailable")

    hdd=hp[n % len(hp)]
    ssd=sp[(n//2) % len(sp)]
    half=W//2
    left=_fit_photo(hdd,(half,H))
    right=_fit_photo(ssd,(W-half,H))

    canvas=Image.new("RGBA",(W,H),(10,12,15,255))
    canvas.alpha_composite(left.convert("RGBA"),(0,0))
    canvas.alpha_composite(right.convert("RGBA"),(half,0))
    d=ImageDraw.Draw(canvas,"RGBA")

    # Central divider and unobtrusive real-photo labels.
    d.rectangle((half-4,0,half+4,H),fill=(255,255,255,190))
    font=ImageFont.truetype(FONT_BOLD,54)
    d.rounded_rectangle((54,140,270,220),radius=22,fill=(10,14,20,205),outline=(255,172,76,235),width=4)
    d.text((162,180),"HDD",font=font,fill=(255,188,100,255),anchor="mm")
    d.rounded_rectangle((W-270,140,W-54,220),radius=22,fill=(10,14,20,205),outline=(96,218,255,235),width=4)
    d.text((W-162,180),"SSD",font=font,fill=(110,225,255,255),anchor="mm")

    out=WORK/f"compare_{n:04d}.png"
    canvas.convert("RGB").save(out,quality=95)
    return out

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

def semantic_phrases(text,maxlen=26):
    """Subtitle splitting on token boundaries only.
    Punctuation always stays with the preceding phrase, so no cue starts with 、 or 。.
    """
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
    punct=set("、。！？!?，,：:；;")
    for surf,pos in toks:
        if surf in punct:
            cur += surf
            if len(cur)>=10:
                out.append(cur.rstrip("。"))
                cur=""
            continue

        candidate=cur+surf
        # If adding a token would exceed the visual limit, cut only at a token boundary.
        if len(candidate)>maxlen and cur:
            out.append(cur.rstrip("。"))
            cur=surf
        else:
            cur=candidate

        if pos in ("助詞","接続詞") and len(cur)>=12:
            out.append(cur.rstrip("。"))
            cur=""

    if cur:
        out.append(cur.rstrip("。"))

    # Repair any punctuation-only prefix defensively.
    fixed=[]
    for p in out:
        if not p: continue
        if fixed and p[0] in punct:
            fixed[-1] += p[0]
            p=p[1:]
        if p:
            fixed.append(p)

    # Merge tiny fragments when safe.
    merged=[]
    for p in fixed:
        core=re.sub(r"[\s、。！？!?，,：:；;]","",p)
        if merged and len(core)<=4 and len(merged[-1])+len(p)<=maxlen:
            merged[-1]+=p
        else:
            merged.append(p)

    return [x for x in merged if x] or [text.rstrip("。")]

def timed_phrases(row):
    ps=semantic_phrases(row["text"])
    weights=[max(3,len(re.sub(r"[\\s、。！？!?]","",p))) for p in ps]
    sw=sum(weights) or 1
    cur=row["st"]
    out=[]
    for i,(p,w) in enumerate(zip(ps,weights)):
        en=row["en"] if i==len(ps)-1 else cur+(row["en"]-row["st"])*w/sw
        out.append({"st":cur,"en":en,"text":p})
        cur=en
    return out

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
        for seg in timed_phrases(row):
            events.append((seg["st"],seg["en"],seg["text"]))
    header="""[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
WrapStyle: 2
ScaledBorderAndShadow: yes
YCbCr Matrix: TV.709

[V4+ Styles]
Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding
Style: Main,Noto Sans CJK JP,94,&H008DFF71,&H008DFF71,&H00101010,&H80000000,-1,0,0,0,100,100,0,0,1,10,4,2,80,80,62,1

[Events]
Format: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text
"""
    with Path(path).open("w",encoding="utf-8-sig") as f:
        f.write(header)
        for st,en,s in events:
            tags="{\\fad(55,65)\\fscx94\\fscy94\\t(0,100,\\fscx100\\fscy100)}"
            f.write(f"Dialogue: 0,{ass_time(st)},{ass_time(en)},Main,,0,0,0,,{tags}{ass_markup(s)}\n")

def _unique(xs):
    out=[]
    for x in xs:
        if x not in out:
            out.append(x)
    return out

HDD_INTERNAL=["hdd_working_video","hdd_open_photo","hdd_head_macro","hdd_side"]
SSD_INTERNAL=["ssd_nand","ssd_controller","sata_ssd","nvme_m2"]
M2_MEDIA=["nvme_m2","m2_installed","sata_vs_nvme","ssd_install"]
SATA_MEDIA=["sata_ssd","sata_connector","sata_data_power","sata_vs_nvme"]
NAS_MEDIA=["nas","server_rack","external_hdds","external_ssd"]
EXTERNAL_MEDIA=["external_ssd","external_hdds","sata_ssd","hdd_side"]
RAM_MEDIA=["ram_ddr4","motherboard","m2_installed"]
PC_MEDIA=["motherboard","m2_installed","computer_components_video","ssd_install"]
STORAGE_MEDIA=["external_ssd","sata_ssd","nvme_m2","hdd_side","hdd_open_photo","m2_installed","sata_vs_nvme","external_hdds"]
APP_MEDIA=["m2_installed","nvme_m2","sata_ssd","hdd_side","computer_components_video","motherboard"]
LOAD_MEDIA=["m2_installed","nvme_m2","sata_ssd","hdd_working_video","computer_components_video"]
BROWSER_MEDIA=["browser_demo_video","m2_installed","nvme_m2","sata_ssd"]
SPEED_MEDIA=["m2_installed","nvme_m2","sata_ssd","hdd_working_video","sata_vs_nvme"]

def strong_media_for(text):
    specific=[]
    if any(k in text for k in ["プラッタ","ヘッド","5400RPM","7200RPM","RPM","CMR","SMR","モーター","回転機構","回転音","カリカリ"]):
        specific.append(HDD_INTERNAL)
    if any(k in text for k in ["NAND","TLC","QLC","コントローラー","TBW","フラッシュメモリ"]):
        specific.append(SSD_INTERNAL)
    if any(k in text for k in ["M.2","NVMe","PCIe"]):
        specific.append(M2_MEDIA)
    if "SATA" in text:
        specific.append(SATA_MEDIA)
    if specific:
        return _unique([x for g in specific for x in g])

    if "ブラウザ" in text:
        return BROWSER_MEDIA
    if any(k in text for k in ["ロード","起動時間","立ち上げ","起動する","起動が"]):
        return LOAD_MEDIA
    if any(k in text for k in ["Windows","アプリ","ゲーム"]):
        return APP_MEDIA
    if "RAM" in text:
        return RAM_MEDIA
    if "NAS" in text:
        return NAS_MEDIA
    if any(k in text for k in ["外付け","USB"]):
        return EXTERNAL_MEDIA
    if any(k in text for k in ["バックアップ","3-2-1","別の場所","クラウド"]):
        return ["nas","external_hdds","external_ssd","server_rack"]
    if any(k in text for k in ["ノートパソコン","小型PC","薄いノート"]):
        return ["m2_installed","nvme_m2","external_ssd","ssd_install"]
    if any(k in text for k in ["消費電力","発熱","熱く"]):
        return ["nvme_m2","m2_installed","motherboard","sata_ssd"]
    if any(k in text for k in ["動作音","振動","衝撃"]):
        return ["hdd_working_video","hdd_open_photo","hdd_head_macro","sata_ssd","nvme_m2"]
    if any(k in text for k in ["容量あたり","大容量","価格","1TB","2TB","4TB","8TB","16TB"]):
        return ["hdd_side","external_hdds","nas","sata_ssd","external_ssd","nvme_m2"]
    if any(k in text for k in ["ストレージ","保存","データ","写真","動画","ファイル"]):
        return STORAGE_MEDIA
    return []

def pool_for(section,text):
    # Explicit technical terms always win over broad chapter-level rotation.
    strong=strong_media_for(text)
    if strong:
        return strong

    sec=section
    if "HDDとは" in sec:
        return HDD_INTERNAL
    if "SSDとは" in sec:
        return ["ssd_controller","ssd_nand","sata_ssd","nvme_m2","m2_installed"]
    if "何が違う" in sec:
        return ["hdd_working_video","hdd_open_photo","hdd_head_macro","sata_ssd","nvme_m2","m2_installed"]
    if "速度" in sec:
        return SPEED_MEDIA
    if "種類" in sec:
        return ["sata_ssd","nvme_m2","m2_installed","sata_vs_nvme","sata_connector","sata_data_power","hdd_side","ssd_controller","ssd_nand"]
    if "容量" in sec:
        return ["hdd_side","external_hdds","external_ssd","sata_ssd","nas","server_rack","nvme_m2"]
    if "寿命" in sec:
        return ["ssd_nand","ssd_controller","hdd_head_macro","hdd_open_photo","hdd_working_video"]
    if "バックアップ" in sec:
        return ["nas","external_hdds","external_ssd","server_rack"]
    if "用途" in sec:
        return ["m2_installed","ssd_install","motherboard","nas","server_rack","nvme_m2","external_ssd","external_hdds","sata_vs_nvme"]
    if "最終" in sec:
        return ["hdd_open_photo","hdd_working_video","sata_ssd","nvme_m2","nas","motherboard"]
    if "第1章" in sec:
        return ["ram_ddr4","motherboard","m2_installed","ssd_install","sata_ssd","hdd_side","external_ssd","external_hdds"]
    return ["external_ssd","sata_ssd","nvme_m2","hdd_open_photo","hdd_side","m2_installed","sata_vs_nvme","external_hdds","motherboard"]

def contextual_pool(section, phrase_text, source_text=None):
    # Keep the technical subject of the whole sentence even after it is split
    # into shorter subtitle/visual phrases.
    strong=strong_media_for(phrase_text)
    if strong:
        return strong
    if source_text and source_text != phrase_text:
        strong=strong_media_for(source_text)
        if strong:
            return strong
    return pool_for(section,phrase_text)

def semantic_asset_ok(text, asset_id, source_text=None):
    strong=strong_media_for(text)
    if not strong and source_text and source_text != text:
        strong=strong_media_for(source_text)
    if not strong:
        return True
    return asset_id in set(strong)

def is_video(p):
    return p.suffix.lower() in (".mp4",".webm",".mov",".mkv")

# Avoid title cards / end credits inside external B-roll.
# Values are (safe_start_seconds, safe_end_margin_seconds).
VIDEO_SAFE_WINDOWS = {
    "hdd_working_video": (12.0, 8.0),
    "computer_components_video": (2.0, 2.0),
    "browser_demo_video": (2.0, 2.0),
    "startup_video": (2.0, 2.0),
}

def safe_video_seek(asset_id, srcdur, clipdur, event_no):
    start, end_margin = VIDEO_SAFE_WINDOWS.get(asset_id, (1.0, 1.5))
    latest = max(start, srcdur - end_margin - clipdur)
    if latest <= start + 0.05:
        return max(0.0, min(start, max(0.0, srcdur - clipdur)))
    span = latest - start
    return start + ((event_no * 3.7) % span)

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
    data_words=["写真","動画","ゲーム","アプリ"]
    if sum(1 for x in data_words if x in t) >= 2:
        d.rounded_rectangle((70,175,700,365),radius=25,fill=(5,10,18,200))
        d.text((100,220),"保存するデータの例",font=fb,fill=(141,255,113,255))
        chips=[("写真",100),("動画",245),("ゲーム",390),("アプリ",555)]
        for label,x in chips:
            d.rounded_rectangle((x,280,x+120,335),radius=16,fill=(255,255,255,24),outline=(141,255,113,150),width=2)
            d.text((x+60,308),label,font=fs,fill=(255,255,255,255),anchor="mm")
    elif any(k in t for k in ["どっち","どこが違う","選べば"]):
        d.rounded_rectangle((70,180,720,355),radius=25,fill=(5,10,18,200))
        d.text((100,225),"SSD  ←  どっち？  →  HDD",font=fb,fill=(141,255,113,255))
        d.text((100,292),"仕組み・速度・容量・価格で比べる",font=fs,fill=(255,255,255,255))
    elif "プラッタ" in t or "ヘッド" in t:
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
    text=ev["row"]["text"]
    source_text=ev["row"].get("source_text",text)
    # If the full narration sentence explicitly compares SSD and HDD, keep
    # both real devices on screen even if the current short phrase only
    # contains one of the two terms.
    if "SSD" in source_text and "HDD" in source_text:
        src=make_ssd_hdd_compare(ev["n"])
    else:
        src=asset(ev["asset"])
    overlay=WORK/f"ov_{ev['n']:04d}.png"
    create_overlay(ev["row"],ev["slot"],overlay)
    pos_right=(ev["n"]//3)%2==0
    zx="W-w-30" if pos_right else "30"
    zy="H-h-16+6*sin(2*PI*t/1.8)"
    # Make actual source the dominant frame. Images get a subtle Ken Burns zoom.
    if is_video(src):
        srcdur=probe_duration(src)
        seek=safe_video_seek(ev["asset"],srcdur,dur,ev["n"])
        base_inputs=["-stream_loop","-1","-ss",f"{seek:.2f}","-i",src]
        base_filter=f"[0:v]{fit_image_filter()},fps={FPS},setpts=PTS-STARTPTS,setsar=1[base]"
    else:
        base_inputs=["-loop","1","-framerate",str(FPS),"-i",src]
        # Slow zoom, never a static still.
        base_filter=f"[0:v]scale=2100:-1:force_original_aspect_ratio=increase,zoompan=z='min(zoom+0.00035,1.08)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s={W}x{H}:fps={FPS},setpts=PTS-STARTPTS,setsar=1[base]"
    cmd=["ffmpeg","-y","-loglevel","error",*base_inputs,
         "-loop","1","-i",overlay,
         "-loop","1","-i",zundamon]
    # darken slightly only behind overlays/captions; actual media stays visible
    fc=[
      base_filter,
      "[base]drawbox=x=0:y=0:w=iw:h=ih:color=black@0.10:t=fill[b0]",
      f"[1:v]format=rgba,setpts=PTS-STARTPTS[ov];[b0][ov]overlay=0:0[b1]",
      "[2:v]format=rgba,scale=-1:560,setpts=PTS-STARTPTS[z]",
      f"[b1][z]overlay=x='{zx}':y='{zy}':format=auto,format=yuv420p[v]"
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

def make_sfx(rows,total):
    """Build a restrained stereo SFX stem from licensed free effects."""
    transition=optional_asset("sfx_transition")
    click=optional_asset("sfx_click")
    success=optional_asset("sfx_success")
    events=[]

    # Chapter starts.
    prev=None
    for r in rows:
        if r["section"]!=prev:
            if prev is not None and transition:
                events.append((r["st"],transition,"transition"))
            prev=r["section"]

    # Important technical corrections/keywords.
    keys=("M.2","NVMe","TBW","3-2-1","FPS","CMR","SMR","バックアップ")
    if click:
        for r in rows:
            if any(k in r["text"] for k in keys):
                events.append((r["st"]+0.08,click,"click"))

    if success:
        events.append((max(0,total-7.0),success,"success"))

    stem=OUT/"sfx_stem.wav"
    if not events:
        run(["ffmpeg","-y","-loglevel","error","-f","lavfi","-i","anullsrc=r=48000:cl=stereo","-t",f"{total:.3f}","-c:a","pcm_s16le",stem])
        return stem

    cmd=["ffmpeg","-y","-loglevel","error","-f","lavfi","-t",f"{total:.3f}","-i","anullsrc=r=48000:cl=stereo"]
    filters=[]
    mix_inputs=["[0:a]"]
    for i,(at,p,kind) in enumerate(events,1):
        cmd += ["-i",str(p)]
        delay=max(0,int(round(at*1000)))
        if kind=="transition":
            filters.append(f"[{i}:a]atrim=0:0.90,afade=t=out:st=0.55:d=0.35,volume=-25dB,adelay={delay}|{delay}[s{i}]")
        elif kind=="success":
            filters.append(f"[{i}:a]atrim=0:1.30,afade=t=out:st=0.80:d=0.50,volume=-25dB,adelay={delay}|{delay}[s{i}]")
        else:
            filters.append(f"[{i}:a]atrim=0:0.22,afade=t=out:st=0.10:d=0.12,volume=-22dB,adelay={delay}|{delay}[s{i}]")
        mix_inputs.append(f"[s{i}]")
    filters.append("".join(mix_inputs)+f"amix=inputs={len(mix_inputs)}:duration=first:normalize=0,aresample=48000[out]")
    cmd += ["-filter_complex",";".join(filters),"-map","[out]","-ar","48000","-ac","2","-c:a","pcm_s16le",stem]
    run(cmd)
    return stem

rows=read_timestamps()
voice=VOICE_DIR/"SSD_HDD_NARRATION_ZUNDAMON_48k.wav"
full_total=probe_duration(voice)
SMOKE_SECONDS=float(os.environ.get("SSD_HDD_SMOKE_SECONDS","0") or 0)
total=min(full_total,SMOKE_SECONDS) if SMOKE_SECONDS>0 else full_total
if SMOKE_SECONDS>0:
    clipped=[]
    for r in rows:
        if r["st"]>=total: break
        x=dict(r); x["en"]=min(x["en"],total)
        clipped.append(x)
    rows=clipped
zundamon=prepare_zundamon(asset("zundamon_official"))

# Build global subtitles from the corrected narration timings.
ass=OUT/"subtitles_green.ass"
make_ass(rows,ass)

events=[]; n=0; last_asset=None; cur=0.0
for row in rows:
    if row["st"]>cur+0.02:
        # Chapter-gap visuals must match the chapter title itself, not the first
        # narration sentence after the gap. This keeps chapter transitions
        # semantically accurate (e.g. price -> capacity media, backup -> NAS/external drives).
        gap_row=dict(row)
        gap_row["text"]=row["section"].split("　",1)[-1]
        pool=[x for x in pool_for(row["section"],gap_row["text"]) if optional_asset(x)]
        if not pool:
            pool=[x for x in pool_for(row["section"],row["text"]) if optional_asset(x)]
        if not pool:
            pool=[x for x in STORAGE_MEDIA if optional_asset(x)]
        if not pool:
            raise RuntimeError("no real-media assets available for chapter gap")
        a=next((x for x in pool if x!=last_asset),pool[0])
        events.append({
            "n":n,"st":cur,"en":row["st"],"asset":a,
            "slot":0,"row":gap_row,"source_idx":row["idx"]
        })
        n+=1
        last_asset=a

    used_in_sentence=set()
    for seg_i,seg in enumerate(timed_phrases(row)):
        phrase_row=dict(row)
        phrase_row["source_text"]=row["text"]
        phrase_row["text"]=seg["text"]
        segdur=seg["en"]-seg["st"]
        slots=max(1,math.ceil(segdur/3.35))
        pool=[x for x in contextual_pool(row["section"],seg["text"],row["text"]) if optional_asset(x)]
        if not pool:
            pool=[x for x in STORAGE_MEDIA if optional_asset(x)]
        if not pool:
            raise RuntimeError("no real-media fallback assets available")

        for s in range(slots):
            st=seg["st"]+segdur*s/slots
            en=seg["st"]+segdur*(s+1)/slots

            choices=[x for x in pool if x!=last_asset and x not in used_in_sentence]
            if not choices:
                choices=[x for x in pool if x!=last_asset]
            if not choices:
                choices=pool

            a=choices[(row["idx"]+seg_i+s+n)%len(choices)]
            events.append({
                "n":n,"st":st,"en":en,"asset":a,
                "slot":s,"row":phrase_row,"source_idx":row["idx"]
            })
            used_in_sentence.add(a)
            n+=1
            last_asset=a
    cur=row["en"]

# final 8 sec: actual hardware montage in 2-second cuts, then next-video title.
ending_row={"section":"次回","text":"次回 SSDとHDDの歴史","idx":9999}
for a in [x for x in ["hdd_open_photo","ssd_controller","nvme_m2","sata_ssd"] if optional_asset(x)]:
    if cur>=total: break
    en=min(total,cur+2.0)
    events.append({"n":n,"st":cur,"en":en,"asset":a,"slot":0,"row":ending_row}); n+=1; cur=en
if cur<total:
    a=next((x for x in ["nvme_m2","sata_ssd","hdd_open_photo","m2_installed"] if optional_asset(x)),None)
    if not a:
        raise RuntimeError("no real-media asset available for ending")
    events.append({"n":n,"st":cur,"en":total,"asset":a,"slot":0,"row":ending_row})

# QA guard: no visual event longer than 4.05 s except if total ending cannot be split.
too_long=[e for e in events if e["en"]-e["st"]>4.05]
if too_long:
    raise RuntimeError("visual hold exceeds 4.05s: "+repr([(e["n"],e["en"]-e["st"]) for e in too_long[:10]]))

semantic_bad=[
    (e["n"],e["asset"],e["row"]["text"])
    for e in events
    if not semantic_asset_ok(e["row"]["text"],e["asset"],e["row"].get("source_text"))
]
if semantic_bad:
    raise RuntimeError("semantic media mismatch: "+repr(semantic_bad[:20]))

bad_browser=[
    e for e in events
    if e["asset"]=="browser_demo_video" and "ブラウザ" not in e["row"]["text"]
]
if bad_browser:
    raise RuntimeError(
        "browser B-roll used outside browser narration: "+
        repr([(e["n"],e["row"]["text"]) for e in bad_browser[:10]])
    )

adjacent_repeat=[
    (events[i-1]["n"],events[i]["n"],events[i]["asset"])
    for i in range(1,len(events))
    if events[i-1]["asset"]==events[i]["asset"]
]
if adjacent_repeat:
    raise RuntimeError("adjacent repeated real-media asset: "+repr(adjacent_repeat[:10]))

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
run([
    "ffmpeg","-y","-loglevel","error",
    "-f","concat","-safe","0","-i",concat,
    "-an","-vf",f"fps={FPS},format=yuv420p,setpts=N/({FPS}*TB)",
    "-c:v","libx264","-preset","ultrafast","-crf","14",
    "-g",str(FPS*2),"-keyint_min",str(FPS*2),"-sc_threshold","0",
    "-movflags","+faststart",visual
])
clean_visual=OUT/"SSD_HDD_REAL_MEDIA_CLEAN.mp4"
run(["ffmpeg","-y","-loglevel","error","-i",visual,"-c:v","copy","-an",clean_visual])

bgm=make_bgm(total)
bgm_out=OUT/"bgm_stem.wav"
run(["ffmpeg","-y","-loglevel","error","-i",bgm,"-ar","48000","-ac","2","-c:a","pcm_s16le",bgm_out])
sfx=make_sfx(rows,total)
final=OUT/"SSD_HDD_REAL_MEDIA_FINAL.mp4"
# External BGM under narration, soft chapter SFX synthesized only as accents.
run([
  "ffmpeg","-y","-loglevel","error","-i",visual,"-i",voice,"-i",bgm,"-i",sfx,
  "-filter_complex",
  f"[0:v]ass={ass.as_posix()}:fontsdir=/usr/share/fonts/opentype/noto[v];"
  "[1:a]aresample=48000,pan=stereo|c0=c0|c1=c0,volume=1.0[n];"
  "[2:a]aformat=sample_rates=48000:channel_layouts=stereo,volume=1.0[b];"
  "[3:a]aformat=sample_rates=48000:channel_layouts=stereo,volume=1.0[s];"
  "[n][b][s]amix=inputs=3:duration=first:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=9,aresample=48000[a]",
  "-map","[v]","-map","[a]","-t",f"{total:.3f}",
  "-c:v","libx264","-preset","medium","-b:v","10M","-maxrate","12M","-bufsize","24M",
  "-pix_fmt","yuv420p","-c:a","aac","-ar","48000","-ac","2","-b:a","256k","-movflags","+faststart",final
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
