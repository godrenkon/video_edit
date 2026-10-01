#!/usr/bin/env python3
from __future__ import annotations
import io, json, re, zipfile
from pathlib import Path
from urllib.parse import urljoin
import requests
from bs4 import BeautifulSoup
from psd_tools import PSDImage

OUT=Path('zundamon23_inspect')
OUT.mkdir(exist_ok=True)
URL='https://ux.getuploader.com/s_ahiru/download/37'
PASSWORD='zunda'
UA={'User-Agent':'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/152 Safari/537.36'}

def download_archive():
    s=requests.Session()
    r=s.get(URL,headers=UA,timeout=60)
    r.raise_for_status()
    if r.content[:2]==b'PK':
        return r.content
    soup=BeautifulSoup(r.text,'html.parser')
    forms=soup.find_all('form')
    errors=[]
    for form in forms:
        pw=form.find('input',{'type':'password'}) or form.find('input',attrs={'name':re.compile('pass',re.I)})
        if not pw:
            continue
        data={}
        for inp in form.find_all('input'):
            name=inp.get('name')
            if name:
                data[name]=inp.get('value','')
        data[pw.get('name','password')]=PASSWORD
        action=urljoin(r.url,form.get('action') or r.url)
        try:
            p=s.post(action,headers={**UA,'Referer':r.url},data=data,timeout=90,allow_redirects=True)
            p.raise_for_status()
            if p.content[:2]==b'PK' or 'zip' in (p.headers.get('content-type') or '').lower():
                return p.content
            ps=BeautifulSoup(p.text,'html.parser')
            for a in ps.find_all('a',href=True):
                href=urljoin(p.url,a['href'])
                label=(a.get_text(' ',strip=True)+' '+href).lower()
                if 'download' in label or '.zip' in label or 'getuploader' in href:
                    try:
                        q=s.get(href,headers={**UA,'Referer':p.url},timeout=90,allow_redirects=True)
                        q.raise_for_status()
                        if q.content[:2]==b'PK' or 'zip' in (q.headers.get('content-type') or '').lower():
                            return q.content
                    except Exception as e:
                        errors.append(repr(e))
        except Exception as e:
            errors.append(repr(e))
    # Also try common uploader.jp password query/form variants.
    for method,url,data in [
        ('get',URL+'?password='+PASSWORD,None),
        ('post',URL,{'password':PASSWORD}),
        ('post',URL,{'pass':PASSWORD}),
        ('post',URL,{'dlpass':PASSWORD}),
    ]:
        try:
            x=s.get(url,headers=UA,timeout=90,allow_redirects=True) if method=='get' else s.post(url,headers=UA,data=data,timeout=90,allow_redirects=True)
            if x.content[:2]==b'PK' or 'zip' in (x.headers.get('content-type') or '').lower():
                return x.content
        except Exception as e:
            errors.append(repr(e))
    (OUT/'download_page.html').write_text(r.text,encoding='utf-8',errors='ignore')
    raise RuntimeError('Could not download archive; '+ ' | '.join(errors[-8:]))

def layer_tree(layer,depth=0,lines=None):
    if lines is None: lines=[]
    name=getattr(layer,'name','')
    vis=getattr(layer,'visible',None)
    kind=layer.__class__.__name__
    lines.append(f"{'  '*depth}{kind}\tvisible={vis}\t{name}")
    if hasattr(layer,'__iter__'):
        try:
            for child in layer:
                layer_tree(child,depth+1,lines)
        except TypeError:
            pass
    return lines

blob=download_archive()
zip_path=OUT/'ずんだもん立ち絵素材2.3.zip'
zip_path.write_bytes(blob)
print('ZIP_BYTES',len(blob))

extract=OUT/'unpacked'
extract.mkdir(exist_ok=True)
with zipfile.ZipFile(io.BytesIO(blob)) as z:
    z.extractall(extract)
    names=z.namelist()
    (OUT/'zip_listing.txt').write_text('\n'.join(names),encoding='utf-8')

psds=list(extract.rglob('*.psd'))
if not psds:
    raise RuntimeError('PSD not found')
psd_path=max(psds,key=lambda p:p.stat().st_size)
print('PSD',psd_path,psd_path.stat().st_size)
psd=PSDImage.open(psd_path)
(OUT/'layer_tree.txt').write_text('\n'.join(layer_tree(psd)),encoding='utf-8')

im=psd.composite()
if im is None:
    raise RuntimeError('PSD composite unavailable')
im.save(OUT/'default_composite.png')

# Save top-level/group composites as inspection sheets where possible.
meta=[]
for i,layer in enumerate(psd):
    entry={'index':i,'name':layer.name,'visible':bool(layer.visible),'type':layer.__class__.__name__}
    try:
        comp=layer.composite()
        if comp is not None:
            fn=f'top_{i:02d}_{re.sub(r"[^0-9A-Za-zぁ-んァ-ン一-龥_-]+","_",layer.name)[:50]}.png'
            comp.save(OUT/fn)
            entry['preview']=fn
    except Exception as e:
        entry['preview_error']=repr(e)
    meta.append(entry)
(OUT/'top_layers.json').write_text(json.dumps(meta,ensure_ascii=False,indent=2),encoding='utf-8')
print('TOP_LAYERS',json.dumps(meta,ensure_ascii=False))
