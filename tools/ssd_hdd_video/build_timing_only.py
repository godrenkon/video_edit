#!/usr/bin/env python3
from __future__ import annotations
import ast
import re
import struct
from pathlib import Path
import requests

ROOT=Path(__file__).resolve().parent
SRC=ROOT/'render.py'
OUT=Path('voice')
OUT.mkdir(parents=True,exist_ok=True)

SPEAKER=3
SPEED=1.04
PRE=0.08
POST=0.11
TAIL=0.10
CHAPTER_GAP=1.30
OUTRO=8.0
SR=48000


def load_sections():
    mod=ast.parse(SRC.read_text(encoding='utf-8'))
    for node in mod.body:
        if isinstance(node,ast.Assign):
            for target in node.targets:
                if isinstance(target,ast.Name) and target.id=='SECTIONS':
                    return ast.literal_eval(node.value)
    raise RuntimeError('SECTIONS not found')


def normalize_for_voice(text:str)->str:
    replacements=[
        ('NVMe','エヌブイエムイー'),('M.2','エムドットツー'),('PCIe','ピーシーアイイー'),
        ('HDD','エイチディーディー'),('SSD','エスエスディー'),('SATA','サタ'),
        ('NAND','ナンド'),('CMR','シーエムアール'),('SMR','エスエムアール'),
        ('TBW','ティービーダブリュー'),('FPS','エフピーエス'),('RAM','ラム'),('NAS','ナス'),
    ]
    for a,b in replacements:
        text=text.replace(a,b)
    text=re.sub(r'(\d+)TB',r'\1テラバイト',text)
    text=re.sub(r'(\d+)GB',r'\1ギガバイト',text)
    return text


def query_duration(text:str)->float:
    r=requests.post('http://127.0.0.1:50021/audio_query',params={'text':normalize_for_voice(text),'speaker':SPEAKER},timeout=60)
    r.raise_for_status()
    q=r.json()
    # Match the full builder's speech controls without doing synthesis.
    q['speedScale']=SPEED
    q['prePhonemeLength']=PRE
    q['postPhonemeLength']=POST
    phoneme=0.0
    for ap in q.get('accent_phrases',[]):
        for m in ap.get('moras',[]):
            phoneme += float(m.get('consonant_length') or 0.0)
            phoneme += float(m.get('vowel_length') or 0.0)
        pm=ap.get('pause_mora')
        if pm:
            phoneme += float(pm.get('consonant_length') or 0.0)
            phoneme += float(pm.get('vowel_length') or 0.0)
    # VOICEVOX speedScale applies to the spoken mora/pause sequence. The fixed
    # pre/post silence and our editorial 0.10 s sentence tail are added outside.
    return PRE + phoneme/SPEED + POST + TAIL


def write_sparse_wav(path:Path,duration:float):
    # Storyboard-only mode needs an ffprobe-able WAV for total duration, not
    # actual audio samples. Write a valid sparse PCM WAV so this step stays fast.
    frames=max(1,int(round(duration*SR)))
    channels=1; bits=16; block=channels*bits//8
    data_size=frames*block
    byte_rate=SR*block
    riff_size=36+data_size
    header=(
        b'RIFF'+struct.pack('<I',riff_size)+b'WAVE'+
        b'fmt '+struct.pack('<IHHIIHH',16,1,channels,SR,byte_rate,block,bits)+
        b'data'+struct.pack('<I',data_size)
    )
    with path.open('wb') as f:
        f.write(header)
        f.seek(44+data_size-1)
        f.write(b'\0')


sections=load_sections()
rows=[]
current=0.0
idx=0
for sec_i,(title,sents) in enumerate(sections):
    if sec_i>0:
        current += CHAPTER_GAP
    for sentence in sents:
        dur=query_duration(sentence)
        st=current; current += dur
        rows.append((idx+1,st,current,title,sentence))
        idx+=1

current += OUTRO

with (OUT/'narration_timestamps.tsv').open('w',encoding='utf-8') as f:
    f.write('index\tstart\tend\tsection\ttext\n')
    for n,st,en,title,text in rows:
        f.write(f'{n}\t{st:.3f}\t{en:.3f}\t{title}\t{text}\n')

write_sparse_wav(OUT/'SSD_HDD_NARRATION_ZUNDAMON_48k.wav',current)
(OUT/'timing_only.txt').write_text(f'sentences={idx}\nduration={current:.3f}\n',encoding='utf-8')
print('TIMING_ONLY_OK','sentences',idx,'duration',f'{current:.3f}')
