#!/usr/bin/env python3
from __future__ import annotations
import ast
from pathlib import Path
import requests
import numpy as np
import soundfile as sf
import subprocess

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "render.py"
OUT = Path("voice_output")
TMP = Path("/tmp/ssd_hdd_voice")
OUT.mkdir(parents=True, exist_ok=True)
TMP.mkdir(parents=True, exist_ok=True)

def load_sections():
    mod = ast.parse(SRC.read_text(encoding="utf-8"))
    for node in mod.body:
        if isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name) and target.id == "SECTIONS":
                    return ast.literal_eval(node.value)
    raise RuntimeError("SECTIONS not found")

def normalize_for_voice(text: str) -> str:
    replacements = [
        ("NVMe", "エヌブイエムイー"),
        ("M.2", "エムドットツー"),
        ("PCIe", "ピーシーアイイー"),
        ("HDD", "エイチディーディー"),
        ("SSD", "エスエスディー"),
        ("SATA", "サタ"),
        ("NAND", "ナンド"),
        ("CMR", "シーエムアール"),
        ("SMR", "エスエムアール"),
        ("TBW", "ティービーダブリュー"),
        ("FPS", "エフピーエス"),
        ("RAM", "ラム"),
        ("NAS", "ナス"),
    ]
    for src, dst in replacements:
        text = text.replace(src, dst)
    text = re.sub(r"(\d+)TB", r"\1テラバイト", text)
    text = re.sub(r"(\d+)GB", r"\1ギガバイト", text)
    return text

def tts(text: str, path: Path):
    q = requests.post(
        "http://127.0.0.1:50021/audio_query",
        params={"text": normalize_for_voice(text), "speaker": 3},
        timeout=120,
    )
    q.raise_for_status()
    data = q.json()

    # ずんだもん・ノーマル。解説動画向けに少しだけテンポを上げ、
    # 抑揚は残しつつ過剰にしない。
    data["speedScale"] = 1.04
    data["pitchScale"] = 0.0
    data["intonationScale"] = 1.06
    data["volumeScale"] = 1.0
    data["prePhonemeLength"] = 0.08
    data["postPhonemeLength"] = 0.11

    r = requests.post(
        "http://127.0.0.1:50021/synthesis",
        params={"speaker": 3},
        json=data,
        timeout=180,
    )
    r.raise_for_status()
    path.write_bytes(r.content)

def read_48k_mono(path: Path):
    y, sr = sf.read(path, dtype="float32")
    if y.ndim > 1:
        y = y.mean(axis=1)
    if sr != 48000:
        old = np.arange(len(y), dtype=np.float64) / sr
        new_len = int(round(len(y) * 48000 / sr))
        new = np.arange(new_len, dtype=np.float64) / 48000
        y = np.interp(new, old, y).astype(np.float32)
    return y.astype(np.float32)

sections = load_sections()
parts = []
timestamps = []
current = 0.0
idx = 0

for sec_i, (title, sentences) in enumerate(sections):
    if sec_i > 0:
        # 現在の完成動画の章タイトル尺に合わせる。
        gap = np.zeros(int(round(1.3 * 48000)), dtype=np.float32)
        parts.append(gap)
        current += 1.3

    for sentence in sentences:
        wav = TMP / f"{idx:04d}.wav"
        tts(sentence, wav)
        voice = read_48k_mono(wav)

        # 1文ごとの自然な間。既存字幕タイミングと合わせる。
        tail = np.zeros(int(round(0.10 * 48000)), dtype=np.float32)
        piece = np.concatenate([voice, tail])
        parts.append(piece)

        st = current
        current += len(piece) / 48000.0
        timestamps.append((idx + 1, st, current, title, sentence))
        idx += 1

# 完成動画のエンドカード8秒と長さを一致させる。
parts.append(np.zeros(int(8 * 48000), dtype=np.float32))
current += 8.0

raw = np.concatenate(parts)
raw_path = OUT / "SSD_HDD_NARRATION_SYNC_RAW.wav"
sf.write(raw_path, raw, 48000, subtype="PCM_24")

# 後でBGMへ載せやすいよう、声だけを -16 LUFS / -2 dBTP へ整える。
final_wav = OUT / "SSD_HDD_NARRATION_ZUNDAMON_48k.wav"
subprocess.run([
    "ffmpeg","-y","-loglevel","error",
    "-i", str(raw_path),
    "-af","loudnorm=I=-16:TP=-2:LRA=7,aresample=48000",
    "-ar","48000","-ac","1","-c:a","pcm_s24le",
    str(final_wav)
], check=True)

final_mp3 = OUT / "SSD_HDD_NARRATION_ZUNDAMON_320k.mp3"
subprocess.run([
    "ffmpeg","-y","-loglevel","error",
    "-i", str(final_wav),
    "-c:a","libmp3lame","-b:a","320k",
    str(final_mp3)
], check=True)

# タイムスタンプも確認用に出す。
with (OUT / "narration_timestamps.tsv").open("w", encoding="utf-8") as f:
    f.write("index\tstart\tend\tsection\ttext\n")
    for n, st, en, title, sentence in timestamps:
        f.write(f"{n}\t{st:.3f}\t{en:.3f}\t{title}\t{sentence}\n")

print(f"sentences={idx}")
print(f"duration={current:.3f}")
print(final_wav)
print(final_mp3)
