#!/usr/bin/env python3
from __future__ import annotations
import json, re, subprocess, sys, time
from pathlib import Path
import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parent
MANIFEST = json.loads((ROOT/"real_assets.json").read_text(encoding="utf-8"))
OUT = Path("real_assets")
OUT.mkdir(exist_ok=True)

UA={"User-Agent":"Mozilla/5.0"}

def ext_from_ct(ct, default):
    ct=(ct or "").lower()
    if "jpeg" in ct: return ".jpg"
    if "png" in ct: return ".png"
    if "webp" in ct: return ".webp"
    if "webm" in ct: return ".webm"
    if "mp4" in ct: return ".mp4"
    if "mpeg" in ct or "mp3" in ct: return ".mp3"
    return default

def download_url(asset):
    last=None
    for attempt in range(5):
        try:
            # Wikimedia asks automated clients to pace requests and prefer thumbnails.
            time.sleep(1.8 if "wikimedia" in asset["download"] else 0.4)
            r=requests.get(asset["download"],headers={**UA,"Accept":"*/*"},timeout=180,allow_redirects=True)
            r.raise_for_status()
            ext=ext_from_ct(r.headers.get("content-type"),Path(asset["download"].split("?")[0]).suffix or ".bin")
            p=OUT/(asset["id"]+ext)
            p.write_bytes(r.content)
            return p
        except Exception as e:
            last=e
            time.sleep(3*(attempt+1))
    raise last

def yt_dlp(asset):
    target=str(OUT/(asset["id"]+".%(ext)s"))
    cmd=[
        sys.executable,"-m","yt_dlp",
        "--no-playlist","--no-warnings",
        "-o",target,
        asset["source"]
    ]
    subprocess.run(cmd,check=True,timeout=300)
    files=sorted(OUT.glob(asset["id"]+".*"))
    if not files: raise RuntimeError("yt-dlp produced no file")
    return files[-1]

def voicevox_image(asset):
    html=requests.get(asset["source"],headers=UA,timeout=60).text
    soup=BeautifulSoup(html,"html.parser")
    candidates=[]
    for img in soup.find_all("img"):
        alt=(img.get("alt") or "")
        src=img.get("src") or img.get("data-src") or ""
        if "ずんだもん" in alt or "zundamon" in src.lower():
            candidates.append(src)
    if not candidates:
        # fallback: inspect og:image and every image URL mentioning product assets
        for tag in soup.find_all(["meta","img"]):
            src=tag.get("content") or tag.get("src") or ""
            if src and ("zund" in src.lower() or "chara" in src.lower()):
                candidates.append(src)
    if not candidates:
        raise RuntimeError("official Zundamon image URL not found")
    from urllib.parse import urljoin
    url=urljoin(asset["source"],candidates[0])
    r=requests.get(url,headers=UA,timeout=120)
    r.raise_for_status()
    ext=ext_from_ct(r.headers.get("content-type"),Path(url).suffix or ".png")
    p=OUT/(asset["id"]+ext)
    p.write_bytes(r.content)
    return p

rows=[]
for a in MANIFEST["assets"]:
    try:
        if "download" in a:
            p=download_url(a)
        elif a["kind"] in ("video_page","audio_page"):
            p=yt_dlp(a)
        elif a["kind"]=="web_image":
            p=voicevox_image(a)
        else:
            raise RuntimeError("unknown asset type")
        rows.append((a["id"],"OK",str(p),p.stat().st_size))
        print("OK",a["id"],p,p.stat().st_size)
    except Exception as e:
        rows.append((a["id"],"FAIL",repr(e),0))
        print("FAIL",a["id"],repr(e))

# write legal/source record regardless of failures
with (OUT/"ATTRIBUTION.md").open("w",encoding="utf-8") as f:
    f.write("# SSD/HDD video external asset credits\n\n")
    for a in MANIFEST["assets"]:
        f.write(f"- **{a['id']}** — {a['credit']} — {a['license']} — {a['source']}\n")

with (OUT/"fetch_report.tsv").open("w",encoding="utf-8") as f:
    f.write("id\tstatus\tpath_or_error\tbytes\n")
    for row in rows:
        f.write("\t".join(map(str,row))+"\n")

fails=[x for x in rows if x[1]=="FAIL"]
print("assets",len(rows),"failed",len(fails))
if fails:
    sys.exit(2)
