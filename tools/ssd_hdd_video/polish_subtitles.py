#!/usr/bin/env python3
from __future__ import annotations
import re, sys
from pathlib import Path

SRC = Path(sys.argv[1])
OUT_SRT = Path(sys.argv[2])
OUT_ASS = Path(sys.argv[3])

def parse_ts(s):
    h,m,rest=s.split(":")
    sec,ms=rest.split(",")
    return int(h)*3600+int(m)*60+int(sec)+int(ms)/1000

def srt_ts(t):
    ms=round(t*1000); h=ms//3600000; ms%=3600000; m=ms//60000; ms%=60000; s=ms//1000; ms%=1000
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"

def ass_ts(t):
    cs=round(t*100); h=cs//360000; cs%=360000; m=cs//6000; cs%=6000; s=cs//100; cs%=100
    return f"{h}:{m:02d}:{s:02d}.{cs:02d}"

def read_srt(path):
    text=path.read_text(encoding="utf-8-sig").replace("\r\n","\n")
    cues=[]
    for block in re.split(r"\n{2,}",text.strip()):
        lines=block.splitlines()
        if len(lines)<3: continue
        m=re.match(r"(\d\d:\d\d:\d\d,\d{3})\s+-->\s+(\d\d:\d\d:\d\d,\d{3})",lines[1])
        if not m: continue
        cues.append({"st":parse_ts(m.group(1)),"en":parse_ts(m.group(2)),"text":" ".join(lines[2:]).strip()})
    return cues

def allocate(st,en,texts):
    weights=[max(3,len(re.sub(r"[\s、。！？!?，,]","",x))) for x in texts]
    total=sum(weights)
    out=[]; cur=st
    for i,(tx,w) in enumerate(zip(texts,weights)):
        nxt=en if i==len(texts)-1 else cur+(en-st)*w/total
        out.append({"st":cur,"en":nxt,"text":tx})
        cur=nxt
    return out

def replace_seq(cues, old, new):
    i=0; hits=0
    while i<=len(cues)-len(old):
        if [c["text"] for c in cues[i:i+len(old)]]==old:
            st=cues[i]["st"]; en=cues[i+len(old)-1]["en"]
            cues[i:i+len(old)]=allocate(st,en,new)
            hits+=1; i+=len(new)
        else:
            i+=1
    return hits

cues=read_srt(SRC)

rules=[
(["パソコンや外付けストレージを見て","いると、SSDとかHDDという"],
 ["パソコンや外付けストレージを見ていると、","SSDとかHDDという"]),

(["今回は、ストレージとは何なのか","という一番基本的なところから始めて、"],
 ["今回は、ストレージとは何なのかという","一番基本的なところから始めて、"]),

(["机で例えるなら、RAMは今使って","いる教科書やノートを広げる机の上で、"],
 ["机で例えるなら、RAMは","今使っている教科書やノートを広げる机の上で、"]),

(["1TBでは、単純に容量が違うだけ","ではなく、そもそも何のために使って","いるのかが違うのだ"],
 ["1TBでは、単純に容量が違うだけではなく、","そもそも何のために使っているのかが違うのだ"]),

(["どれくらいの量のデータを保存できるのか","を表しているのだ"],
 ["どれくらいの量のデータを保存できるのかを","表しているのだ"]),

(["HDDは、Hard Disk Driveの","略なのだ"],
 ["HDDは、Hard Disk Driveの略なのだ"]),

(["高速で回転していて、そのすぐ近くに","はヘッドと呼ばれる非常に","小さな読み書き部分があるのだ"],
 ["高速で回転していて、そのすぐ近くには","ヘッドと呼ばれる非常に小さな読み書き部分があるのだ"]),

(["プラッタへ直接触れながら読み取って","いるわけではないのだ"],
 ["プラッタへ直接触れながら","読み取っているわけではないのだ"]),

(["SSDは、Solid State Driveの","略で、HDDと同じようにデータを","保存するためのストレージなのだ"],
 ["SSDは、Solid State Driveの略で、","HDDと同じようにデータを保存するためのストレージなのだ"]),

(["アプリやゲームを立ち上げたり","する時にも影響するのだ"],
 ["アプリやゲームを立ち上げたりする時にも","影響するのだ"]),

(["かなり有利に見えるけど、HDDに","は大容量を比較的安く用意しやすいという","大きな強みがあるのだ"],
 ["かなり有利に見えるけど、HDDには","大容量を比較的安く用意しやすいという大きな強みがあるのだ"]),

(["必要ないので、特にランダムな読み書きで","はHDDとの差が大きくなりやすいのだ"],
 ["必要ないので、特にランダムな読み書きでは","HDDとの差が大きくなりやすいのだ"]),

(["M.2なら必ず高速なNVMe SSD","というわけではないのだ"],
 ["M.2なら必ず高速なNVMe SSDという","わけではないのだ"]),

(["ただし実際のSSD性能はNANDだけ","ではなく、コントローラーやキャッシュ、","ファームウェアなどにも左右されるので、"],
 ["ただし実際のSSD性能はNANDだけではなく、","コントローラーやキャッシュ、ファームウェアなどにも左右されるので、"]),

(["これはプラッタが1分間に何回転するのか","を表しているのだ"],
 ["これはプラッタが1分間に何回転するのかを","表しているのだ"]),

(["大量のデータを書き換えるような場面で","は性能が落ちる場合があるので、"],
 ["大量のデータを書き換えるような場面では","性能が落ちる場合があるので、"]),

(["けど何TBものデータを保存する用途で","は、HDDの容量あたりの価格の","安さが今でも大きな強みなのだ"],
 ["けど何TBものデータを保存する用途では、","HDDの容量あたりの価格の安さが今でも大きな強みなのだ"]),

(["SSDで使われているNANDフラッシュに","は、データの書き換えを繰り返すことで","少しずつ劣化していく性質があるのだ"],
 ["SSDで使われているNANDフラッシュには、","データの書き換えを繰り返すことで少しずつ劣化していく性質があるのだ"]),

(["故障する可能性もあるので、SSDに","もHDDにもそれぞれ違った故障要因があるのだ"],
 ["故障する可能性もあるので、","SSDにもHDDにもそれぞれ違った故障要因があるのだ"]),

(["つまりSSDかHDDかを選んだだけ","では、バックアップにはならないのだ"],
 ["つまりSSDかHDDかを選んだだけでは、","バックアップにはならないのだ"]),

(["静音性、衝撃への強さ、小型化など","で有利になりやすく、HDDは","大容量を比較的安く用意しやすいという"],
 ["静音性、衝撃への強さ、小型化などで","有利になりやすく、HDDは","大容量を比較的安く用意しやすいという"]),

(["あるなら全部SSDにすることも","できるし、大量保存が中心ならHDDを","多く使う構成も考えられるのだ"],
 ["あるなら全部SSDにすることもできるし、","大量保存が中心ならHDDを多く使う構成も考えられるのだ"]),
]

hits=0
for old,new in rules:
    hits += replace_seq(cues,old,new)

# Safe cleanup: do not leave tiny fragment-only captions.
i=0
while i<len(cues):
    core=re.sub(r"[\s、。！？!?，,]","",cues[i]["text"])
    if len(core)<=4 and len(cues)>1:
        if i>0 and len(cues[i-1]["text"])+len(cues[i]["text"])<=31:
            cues[i-1]["text"]+=cues[i]["text"]
            cues[i-1]["en"]=cues[i]["en"]
            del cues[i]; continue
        elif i+1<len(cues) and len(cues[i]["text"])+len(cues[i+1]["text"])<=31:
            cues[i]["text"]+=cues[i+1]["text"]
            cues[i]["en"]=cues[i+1]["en"]
            del cues[i+1]; continue
    i+=1

# SRT
with OUT_SRT.open("w",encoding="utf-8") as f:
    for n,c in enumerate(cues,1):
        f.write(f"{n}\n{srt_ts(c['st'])} --> {srt_ts(c['en'])}\n{c['text']}\n\n")

COLORS={
    "SSD":"&H00FF8935&","NVMe":"&H00E0DC46&","M.2":"&H00FF8935&","NAND":"&H00FF8935&",
    "HDD":"&H00449EF6&","プラッタ":"&H00449EF6&","ヘッド":"&H00449EF6&","CMR":"&H00449EF6&","SMR":"&H00449EF6&",
    "TBW":"&H006758FF&","故障":"&H006758FF&","≠":"&H006758FF&",
    "3-2-1":"&H008FD250&","バックアップ":"&H008FD250&",
    "FPS":"&H00E0DC46&","RAM":"&H00E0DC46&"
}
pat=re.compile("|".join(re.escape(k) for k in sorted(COLORS,key=len,reverse=True)))
def ass_text(s):
    s=s.replace("\\","\\\\").replace("{","(").replace("}",")")
    return pat.sub(lambda m:"{\\c"+COLORS[m.group(0)]+"}"+m.group(0)+"{\\c&H00FFFFFF&}",s)

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
with OUT_ASS.open("w",encoding="utf-8-sig") as f:
    f.write(header)
    for c in cues:
        tags="{\\fad(65,75)\\fscx94\\fscy94\\t(0,120,\\fscx100\\fscy100)}"
        f.write(f"Dialogue: 0,{ass_ts(c['st'])},{ass_ts(c['en'])},Main,,0,0,0,,{tags}{ass_text(c['text'])}\n")

print(f"cues={len(cues)} explicit_rule_hits={hits}")
