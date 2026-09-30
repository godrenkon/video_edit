#!/usr/bin/env python3
from __future__ import annotations
import json, time
from pathlib import Path
from urllib.parse import urljoin
import requests
from bs4 import BeautifulSoup

ROOT=Path(__file__).resolve().parent
MANIFEST=json.loads((ROOT/'real_assets.json').read_text(encoding='utf-8'))
ASSETS={a['id']:a for a in MANIFEST['assets']}
OUT=Path('real_assets')
OUT.mkdir(exist_ok=True)
UA={'User-Agent':'Mozilla/5.0 SSD-HDD explainer core fetch/1.0'}

REQUIRED=[
    'hdd_working_video','hdd_open_photo','hdd_head_macro','hdd_side',
    'sata_ssd','nvme_m2','ssd_controller','ssd_nand','sata_vs_nvme',
    'motherboard','ssd_install','nas','server_rack','zundamon_official',
    'bgm_pamgaea','bgm_envision','bgm_mellowtron',
    'laptop_hdd_open','hdd_size_compare','nas_drive_bay','laptop_nvme',
]
OPTIONAL=[
    'crucial_ssd','hdd_ssd_disassembled','external_hdd_laptop',
    'computer_components_video','browser_demo_video',
]

def ext_from_ct(ct,url):
    ct=(ct or '').lower()
    if 'jpeg' in ct: return '.jpg'
    if 'png' in ct: return '.png'
    if 'webp' in ct: return '.webp'
    if 'webm' in ct: return '.webm'
    if 'mp4' in ct: return '.mp4'
    if 'ogg' in ct: return '.ogg'
    if 'mpeg' in ct or 'mp3' in ct: return '.mp3'
    return Path(url.split('?')[0]).suffix or '.bin'

def get(url, timeout=45):
    last=None
    for n in range(3):
        try:
            time.sleep(0.8 if 'wikimedia' in url else 0.2)
            r=requests.get(url,headers=UA,timeout=timeout,allow_redirects=True)
            r.raise_for_status()
            return r
        except Exception as e:
            last=e
            time.sleep(1.5*(n+1))
    raise last

def fetch_direct(a):
    r=get(a['download'])
    p=OUT/(a['id']+ext_from_ct(r.headers.get('content-type'),a['download']))
    p.write_bytes(r.content)
    if p.stat().st_size < 5000:
        raise RuntimeError(f'suspiciously small: {p.stat().st_size}')
    return p

def fetch_zundamon(a):
    html=get(a['source'],30).text
    soup=BeautifulSoup(html,'html.parser')
    urls=[]
    for tag in soup.find_all(['img','meta']):
        alt=(tag.get('alt') or '')
        src=tag.get('src') or tag.get('data-src') or tag.get('content') or ''
        if 'ずんだもん' in alt or 'zund' in src.lower():
            urls.append(urljoin(a['source'],src))
    if not urls:
        raise RuntimeError('official Zundamon image not found')
    r=get(urls[0],45)
    p=OUT/(a['id']+ext_from_ct(r.headers.get('content-type'),urls[0]))
    p.write_bytes(r.content)
    return p

def fetch_one(a):
    if a.get('download'):
        return fetch_direct(a)
    if a['id']=='zundamon_official':
        return fetch_zundamon(a)
    raise RuntimeError('no supported direct source')

rows=[]
for aid in REQUIRED+OPTIONAL:
    a=ASSETS.get(aid)
    required=aid in REQUIRED
    if not a:
        rows.append((aid,'FAIL_REQUIRED' if required else 'SKIP_OPTIONAL','missing manifest',0))
        continue
    try:
        p=fetch_one(a)
        rows.append((aid,'OK',str(p),p.stat().st_size))
        print('OK',aid,p,p.stat().st_size,flush=True)
    except Exception as e:
        rows.append((aid,'FAIL_REQUIRED' if required else 'SKIP_OPTIONAL',repr(e),0))
        print('FAIL',aid,repr(e),flush=True)

with (OUT/'ATTRIBUTION.md').open('w',encoding='utf-8') as f:
    f.write('# SSD/HDD V10 core asset credits\n\n')
    for aid in REQUIRED+OPTIONAL:
        a=ASSETS.get(aid)
        if a:
            f.write(f"- **{aid}** — {a.get('credit','')} — {a.get('license','')} — {a.get('source','')}\n")

with (OUT/'fetch_report.tsv').open('w',encoding='utf-8') as f:
    f.write('id\tstatus\tpath_or_error\tbytes\n')
    for row in rows:
        f.write('\t'.join(map(str,row))+'\n')

bad=[r for r in rows if r[1]=='FAIL_REQUIRED']
print('core_requested',len(REQUIRED),'required_failed',len(bad),'total_files',len(list(OUT.glob('*'))),flush=True)
if bad:
    raise SystemExit(2)
