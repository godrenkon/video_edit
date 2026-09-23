#!/usr/bin/env python3
from __future__ import annotations
import json, time
from pathlib import Path
import requests

ROOT=Path(__file__).resolve().parent
manifest=json.loads((ROOT/"real_assets.json").read_text(encoding="utf-8"))
assets={a["id"]:a for a in manifest["assets"]}
NEEDED=[
    "ram_ddr4",
    "m2_installed",
    "external_hdds",
    "external_ssd",
    "sata_connector",
    "sata_data_power",
    "external_hdd_laptop",
    "pc_m2_hdd_inside",
]
OUT=Path("real_assets_extra")
OUT.mkdir(exist_ok=True)
UA={"User-Agent":"Mozilla/5.0 SSD-HDD explainer asset fetch/1.0"}

def ext_from_ct(ct,url):
    ct=(ct or "").lower()
    if "jpeg" in ct: return ".jpg"
    if "png" in ct: return ".png"
    if "webp" in ct: return ".webp"
    if "ogg" in ct: return ".ogg"
    p=Path(url.split("?")[0])
    return p.suffix or ".bin"

rows=[]
for aid in NEEDED:
    a=assets.get(aid)
    if not a:
        rows.append((aid,"FAIL","missing from manifest",0))
        continue
    url=a.get("download")
    if not url:
        rows.append((aid,"FAIL","no direct download URL",0))
        continue
    last=None
    for attempt in range(6):
        try:
            time.sleep(2.2)
            r=requests.get(url,headers=UA,timeout=180,allow_redirects=True)
            r.raise_for_status()
            ext=ext_from_ct(r.headers.get("content-type"),url)
            p=OUT/(aid+ext)
            p.write_bytes(r.content)
            if p.stat().st_size < 25000:
                raise RuntimeError(f"download suspiciously small: {p.stat().st_size}")
            rows.append((aid,"OK",str(p),p.stat().st_size))
            print("OK",aid,p,p.stat().st_size,flush=True)
            break
        except Exception as e:
            last=e
            print("RETRY",aid,attempt+1,repr(e),flush=True)
            time.sleep(3.0*(attempt+1))
    else:
        rows.append((aid,"FAIL",repr(last),0))

with (OUT/"ATTRIBUTION_EXTRA.md").open("w",encoding="utf-8") as f:
    f.write("# Additional real-media credits\n\n")
    for aid in NEEDED:
        a=assets.get(aid)
        if a:
            f.write(f"- **{aid}** — {a.get('credit','')} — {a.get('license','')} — {a.get('source','')}\n")

with (OUT/"fetch_report.tsv").open("w",encoding="utf-8") as f:
    f.write("id\tstatus\tpath_or_error\tbytes\n")
    for row in rows:
        f.write("\t".join(map(str,row))+"\n")

fails=[x for x in rows if x[1]!="OK"]
print("requested",len(rows),"failed",len(fails),flush=True)
if fails:
    raise SystemExit(2)
