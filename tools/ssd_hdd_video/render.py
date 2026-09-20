#!/usr/bin/env python3
from __future__ import annotations
import json, math, os, re, subprocess, textwrap, wave
from pathlib import Path
import requests
import numpy as np
import soundfile as sf
from PIL import Image, ImageDraw, ImageFont, ImageFilter

W,H,FPS = 1920,1080,30
ROOT = Path(__file__).resolve().parent
WORK = ROOT / "_build"
OUT = Path("output")
WORK.mkdir(parents=True, exist_ok=True)
OUT.mkdir(parents=True, exist_ok=True)

BG0=(8,13,27); BG1=(17,28,52); WHITE=(240,244,252); MUTED=(154,167,191)
SSD=(48,132,255); HDD=(245,157,66); CYAN=(75,214,220); RED=(255,94,105); GREEN=(79,204,138)
PANEL=(20,31,55,235)

FONT_BOLD="/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc"
FONT_REG="/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"
def font(sz,b=True): return ImageFont.truetype(FONT_BOLD if b else FONT_REG, sz)

SECTIONS = [
("オープニング", [
"どうも、ずんだもんなのだ。",
"今回は、SSDとHDDの違いについて解説していくのだ。",
"パソコンや外付けストレージを見ていると、SSDとかHDDという名前をよく見かけると思うけど、そもそも何をする部品なのか、どこが違うのか、結局どっちを選べばいいのか分からないという人も多いと思うのだ。",
"SSDとHDDは、どちらも写真や動画、ゲーム、アプリなどのデータを保存しておくためのストレージなのだ。",
"大まかな役割は同じだけど、中でデータを保存している方法がまったく違うので、速度や価格、容量、音、耐久性、消費電力、向いている使い方までかなり変わってくるのだ。",
"今回は、ストレージとは何なのかという一番基本的なところから始めて、HDDとSSDそれぞれの仕組み、種類、速度、価格、寿命、そして実際の使い分けまで、何も知らない人でも分かるように順番に解説していくのだ。"
]),
("第1章　SSDとHDDは何をする部品？", [
"まずは、SSDとHDDがパソコンの中で何をしているのかを知っておくのだ。",
"パソコンの中にはCPUやメモリ、グラフィックボードなどいろいろな部品が入っているけど、その中でSSDとHDDが担当しているのは、データを保存しておくことなのだ。",
"例えばWindowsそのものや、インストールしたゲーム、ブラウザや動画編集ソフトなどのアプリ、撮影した写真や動画、ダウンロードしたファイルなんかも、基本的にはストレージへ保存されているのだ。",
"パソコンの電源を切って、次の日にもう一度起動しても写真やゲームがそのまま残っているのは、ストレージにデータが保存されているからなのだ。",
"ここで少しややこしいのが、パソコンの説明でよく一緒に出てくるメモリとの違いなのだ。",
"メモリ、つまりRAMは、パソコンが今まさに使っているデータを一時的に置いておく作業場所なのだ。",
"それに対してSSDやHDDは、電源を切ったあとにも残しておきたいデータを保存しておく場所なのだ。",
"机で例えるなら、RAMは今使っている教科書やノートを広げる机の上で、SSDやHDDは使い終わった物や、あとから必要になる物をしまっておく棚みたいなものなのだ。",
"だからメモリが16GBとSSDが1TBでは、単純に容量が違うだけではなく、そもそも何のために使っているのかが違うのだ。",
"そして500GBや1TB、4TBといった数字は、そのストレージへどれくらいの量のデータを保存できるのかを表しているのだ。",
"SSDとHDDはどちらもデータを保存するストレージだけど、保存する仕組みが大きく違うので、まずはHDDの中から見ていくのだ。"
]),
("第2章　HDDとは？", [
"HDDは、Hard Disk Driveの略なのだ。",
"HDDの中を開けると、まずプラッタと呼ばれる円盤が入っていて、この円盤に磁気を使ってデータを記録しているのだ。",
"HDDを使っている時にはプラッタが高速で回転していて、そのすぐ近くにはヘッドと呼ばれる非常に小さな読み書き部分があるのだ。",
"このヘッドを目的の位置まで移動させることで、プラッタへ新しいデータを書き込んだり、保存されているデータを読み取ったりしているのだ。",
"かなり大雑把にイメージするなら、回転する円盤と読み取り部分を使うという意味では、レコードプレーヤーに少し似ているのだ。",
"ただし実際のHDDはもっと精密で、レコードの針みたいにヘッドがプラッタへ直接触れながら読み取っているわけではないのだ。",
"HDDに保存された一つのファイルを読みたい時には、まず欲しいデータが記録された場所までヘッドを移動させる必要があるのだ。",
"さらにヘッドが目的の位置へ来ても、読みたいデータが反対側にあれば、その場所が回転してヘッドの下まで来るのを待つ必要があるのだ。",
"つまりHDDでは、データそのものを読む時間だけではなく、ヘッドを動かす時間と、目的の場所が回ってくるのを待つ時間も発生しているのだ。",
"大きな動画ファイルのようにまとまったデータを順番に読む時は比較的効率がいいけど、小さなファイルがいろいろな場所へ散らばっていると、そのたびにヘッドを移動させる必要があるのだ。",
"この中の部品が実際に動いているという特徴が、HDDの速度だけではなく、動作音や振動、衝撃への弱さにもつながってくるのだ。"
]),
("第3章　SSDとは？", [
"次はSSDなのだ。",
"SSDは、Solid State Driveの略で、HDDと同じようにデータを保存するためのストレージなのだ。",
"けどSSDの中には、HDDのような回転するプラッタは入っていないのだ。",
"SSDでは主に、NANDフラッシュメモリと呼ばれる半導体のメモリへデータを保存しているのだ。",
"さらにコントローラーと呼ばれる部品が、どこへデータを書き込むのか、どこから読み出すのかといった処理を管理しているのだ。",
"HDDでは欲しいデータがある場所までヘッドを実際に移動させていたけど、SSDではそうした機械的な移動をせずに、電気的にデータへアクセスしているのだ。",
"だからSSDには、高速で回る円盤も、読み書きするために左右へ動き続けるヘッドもないのだ。",
"ただしSSDも、NANDへデータを書いて終わりという単純な装置ではないのだ。",
"NANDフラッシュには、同じ場所へ何度も書き込みを続けると少しずつ劣化していく性質があるので、コントローラーが書き込みを分散したり、エラーを訂正したりしながらSSD全体を管理しているのだ。",
"つまりHDDは磁気ディスクと機械部品を使い、SSDは半導体メモリとコントローラーを使うという根本的な違いがあるのだ。"
]),
("第4章　SSDとHDDは何が違う？", [
"それぞれの仕組みが分かったところで、ここからはSSDとHDDを直接比べていくのだ。",
"まず分かりやすいのがデータへアクセスする速さなのだ。",
"HDDでは読みたい場所までヘッドを移動して、さらにプラッタが回ってくるのを待つ必要があるけど、SSDではこの物理的な待ち時間がないのだ。",
"そのため一般的には、SSDの方が必要なデータへ素早くアクセスしやすいのだ。",
"この違いは、大きなファイルをコピーする時だけではなく、Windowsを起動したり、アプリやゲームを立ち上げたりする時にも影響するのだ。",
"そしてHDDで部品が動いているという特徴は、そのまま音や振動にもつながってくるのだ。",
"HDDではプラッタが回転してヘッドも動くので、回転音やカリカリとした読み書き音が聞こえることがあるのだ。",
"一方SSDにはこうした可動部品がないので、SSD自体からHDDのような機械的な回転音が出ることはなく、振動もかなり少ないのだ。",
"可動部品があるかどうかは衝撃への強さにも関係して、特に動作中のHDDへ強い衝撃が加わると故障につながる可能性があるのだ。",
"ここまで見るとSSDの方がかなり有利に見えるけど、HDDには大容量を比較的安く用意しやすいという大きな強みがあるのだ。",
"何TB、何十TBと保存したい容量が増えていくほど、容量あたりの価格は重要になってくるのだ。",
"だから速度が重要なデータはSSD、大量に残したいデータはHDDという役割分担もできるのだ。",
"SSDにはM.2のような小型な形もあるので、薄いノートパソコンや小型PCでも使いやすいのだ。",
"消費電力も一般的にはSSDが低くなりやすいけど、高性能なNVMe SSDは大量のデータを高速に処理すると発熱することもあるので、SSDなら絶対に熱くならないというわけではないのだ。"
]),
("第5章　速度の違いを詳しく見てみる", [
"ストレージの商品を見ると、読み込み毎秒500MBとか、毎秒7000MBといった数字が書かれていることがあるのだ。",
"数字だけなら大きい方が速いと分かるけど、一つの数字だけで実際の速さを全部判断することはできないのだ。",
"そこで知っておきたいのが、シーケンシャルアクセスとランダムアクセスなのだ。",
"シーケンシャルアクセスは、大きなデータを連続して読み書きするような処理で、例えば一本の大きな動画ファイルをコピーする場面が分かりやすいのだ。",
"一方のランダムアクセスは、小さなデータをいろいろな場所から次々に読み書きする処理なのだ。",
"Windowsの起動やアプリ、ゲームの立ち上げでは、細かなデータを大量に読み込むので、ランダムアクセス性能もかなり重要になるのだ。",
"HDDでは読みたい場所が変わるたびにヘッドを移動させる必要があるので、小さなデータが散らばっているほど移動時間が積み重なりやすいのだ。",
"SSDではこの物理的な移動が必要ないので、特にランダムな読み書きではHDDとの差が大きくなりやすいのだ。",
"一方、大きなファイルを順番に読み続ける場合にはHDDでも比較的効率よく処理できるので、SSDはどんな処理でも必ず同じ倍率だけ速いというわけではないのだ。",
"SATA SSDでは毎秒500MB台の読み込み性能を持つ製品があり、高速なNVMe SSDではさらに大きな数字が出る製品もあるのだ。",
"けどベンチマークで何倍も大きな数字が出ても、Windowsの起動やゲームのロードが同じ倍率で速くなるわけではないのだ。",
"ゲームでもSSDはロード時間やデータ読み込みを改善しやすいけど、それだけで平均FPSが何倍にも増えるわけではないのだ。"
]),
("第6章　SSDとHDDにはどんな種類がある？", [
"SSDもHDDも、一種類だけではないのだ。",
"まずSSDでは、薄い箱のような形をした2.5インチのSATA SSDがあるのだ。",
"もう一つよく見るのが、細長い基板のような形をしたM.2 SSDなのだ。",
"M.2は主に物理的な形についての名前で、NVMeはストレージとコンピューターが通信するための仕様なので、同じ意味ではないのだ。",
"実際にM.2の形をしていてもSATAを使うSSDは存在するので、M.2なら必ず高速なNVMe SSDというわけではないのだ。",
"さらにSSDでは、TLCやQLCといったNANDフラッシュの種類を見ることもあるのだ。",
"TLCは一つのセルへ3ビット、QLCは4ビットの情報を保存する方式で、QLCは高密度化しやすい一方、一般的には書き込み性能や耐久性でTLCより不利になりやすいのだ。",
"ただし実際のSSD性能はNANDだけではなく、コントローラーやキャッシュ、ファームウェアなどにも左右されるので、一つの項目だけで良し悪しは決められないのだ。",
"HDDではまず、主に3.5インチと2.5インチという大きさの違いがあるのだ。",
"3.5インチHDDはデスクトップPCやNASなどでよく使われ、2.5インチHDDはノートPCや小型の外付けドライブなどで使われてきたのだ。",
"さらに5400RPMや7200RPMという数字があって、これはプラッタが1分間に何回転するのかを表しているのだ。",
"回転数は性能へ影響するけど、RPMだけでHDD全体の性能が決まるわけではないのだ。",
"HDDにはCMRとSMRという記録方式の違いもあるのだ。",
"CMRではトラックを基本的に隣り合わせに記録するのに対して、SMRでは一部を重ねるように記録して記録密度を高めるのだ。",
"SMRは大容量化しやすい一方で、大量のデータを書き換えるような場面では性能が落ちる場合があるので、用途に合わせて選ぶ必要があるのだ。"
]),
("第7章　容量と価格はどう違う？", [
"実際にストレージを買う時には、速さだけではなく、どれくらい保存できるのかと、その容量をいくらで用意できるのかも重要なのだ。",
"SSDも昔と比べるとかなり安くなって、大容量の製品も増えているのだ。",
"けど何TBものデータを保存する用途では、HDDの容量あたりの価格の安さが今でも大きな強みなのだ。",
"Windowsや普段使うアプリ、ゲームを入れるだけなら1TBや2TBのSSDでも十分な人は多いのだ。",
"けど高画質な動画を何十本、何百本と保存したり、編集前の素材まで残したりすると、必要な容量は一気に増えていくのだ。",
"パソコン全体のバックアップを複数残す場合も、数TB単位の容量が必要になることがあるのだ。",
"そういう場面では大容量HDDが便利で、普段よく使うデータはSSDへ置き、大量に残したいデータはHDDへ保存するという使い分けができるのだ。",
"ストレージの価格は時期によって変わるので、固定価格を覚えるより、買う時点で容量あたりの価格を比べる方が実用的なのだ。"
]),
("第8章　寿命と故障はどう違う？", [
"ストレージは何年も使うことが多いので、寿命や故障の違いも重要なのだ。",
"SSDで使われているNANDフラッシュには、データの書き換えを繰り返すことで少しずつ劣化していく性質があるのだ。",
"そのためSSDの商品ページには、TBWという書き込み耐久性を見るための指標が書かれていることがあるのだ。",
"けどTBWの数字へ到達した瞬間にSSDが突然壊れるという意味ではなく、耐久性や保証条件を見るための目安の一つなのだ。",
"一方HDDには同じNANDの書き込み寿命はないけど、モーターやヘッド、回転機構などの機械部品を持っているのだ。",
"長く使えばそうした部品が故障する可能性もあるので、SSDにもHDDにもそれぞれ違った故障要因があるのだ。",
"だからSSDなら絶対に安全とか、HDDなら永久に保存できると考えるのは危険なのだ。",
"製品の品質や使用時間、書き込み量、温度、衝撃、保存環境などで寿命は変わるので、SSDは必ず何年、HDDは必ず何年と一つの数字で決めることもできないのだ。"
]),
("第9章　バックアップは必要", [
"どちらにも故障する可能性がある以上、本当に大切なデータはストレージ一台だけへ置かないことが重要なのだ。",
"高性能なSSD一台にしかない写真も、大容量HDD一台にしかない動画も、その一台が壊れれば失う可能性があるのだ。",
"つまりSSDかHDDかを選んだだけでは、バックアップにはならないのだ。",
"本当に消したくないデータなら、同じデータを別の場所にも残しておくことが大切なのだ。",
"バックアップでは、3-2-1という考え方がよく使われるのだ。",
"大切なデータを合計3つ持って、2種類の保存先を使い、さらに1つを別の場所へ置いておくという考え方なのだ。",
"重要なのは絶対に壊れない一台を探すことではなく、一台が壊れてもデータが残る状態を作ることなのだ。"
]),
("第10章　用途ごとにどっちが向いている？", [
"ここまでの違いを、実際の使い方へ当てはめてみるのだ。",
"Windowsを入れるメインストレージや、普段使うアプリにはSSDが向いているのだ。",
"細かなデータを頻繁に読み込むので、SSDの高速なアクセスを活かしやすく、起動や操作の待ち時間を短くしやすいのだ。",
"ゲームでも、起動やステージのロード、マップ移動などで大量のデータを読み込むので、SSDのメリットを活かしやすいのだ。",
"ただしSSDに変えただけで平均FPSが何倍にも増えるわけではなく、FPSにはCPUやGPUなど別の部品も大きく関係しているのだ。",
"動画編集では、現在編集中の素材やキャッシュ、プロジェクトファイルをSSDへ置くことで、高速な読み書きを活かしやすいのだ。",
"一方で編集が終わった動画を何TBも保存するなら、HDDへ移して保管することでコストを抑えやすくなるのだ。",
"大量の写真や動画の保存、バックアップ、容量を重視するNASなどでもHDDの強みを活かしやすいのだ。",
"ノートパソコンでは、小型で可動部品がなく、持ち運びにも向いているSSDが使われることが多いのだ。",
"外付けSSDでは、SSD本体が高速でもUSBなど接続側の規格が遅ければ、そこで速度が制限されることがあるので、接続規格も確認する必要があるのだ。"
]),
("最終章　SSDとHDD、結局どっちを選ぶ？", [
"ここまで見てきたように、SSDとHDDはどちらもデータを保存するストレージだけど、中で使っている仕組みはかなり違うのだ。",
"HDDは磁気ディスクを回転させてヘッドを動かしながらデータを読み書きし、SSDはNANDフラッシュメモリへ電気的にアクセスしてデータを読み書きするのだ。",
"この違いによって、SSDは速度や静音性、衝撃への強さ、小型化などで有利になりやすく、HDDは大容量を比較的安く用意しやすいという強みを持っているのだ。",
"だからSSDとHDDのどちらが完全に上なのかと考えるより、自分が何を保存したいのか、速度と容量のどちらを重視したいのかで選ぶ方が分かりやすいのだ。",
"Windowsやアプリ、ゲーム、現在作業しているデータはSSDへ置いて、写真や完成した動画、バックアップなど大量に保存しておきたいデータはHDDへ置くという使い分けもできるのだ。",
"必要な容量が少なく予算に余裕があるなら全部SSDにすることもできるし、大量保存が中心ならHDDを多く使う構成も考えられるのだ。",
"大切なのは、SSDだから良い、HDDだから古いと名前だけで判断するのではなく、それぞれの特徴を理解したうえで、自分の用途に合ったものを選ぶことなのだ。",
"ということで今回は、SSDとHDDの違いについて解説してきたのだ。",
"この動画が分かりやすかった、参考になったという人は、高評価とチャンネル登録もよろしくお願いしますなのだ。",
"それでは、また次の動画で会おうなのだ。"
])
]

def wrap_jp(s, n=29):
    return [s[i:i+n] for i in range(0,len(s),n)]

def gradient():
    im=Image.new("RGB",(W,H),BG0); p=im.load()
    for y in range(H):
        t=y/(H-1); c=tuple(int(BG0[i]*(1-t)+BG1[i]*t) for i in range(3))
        for x in range(W): p[x,y]=c
    return im

def rr(d, box, radius, fill, outline=None, width=2):
    d.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)

def txt(d, xy, s, size, fill=WHITE, anchor="la", bold=True):
    d.text(xy,s,font=font(size,bold),fill=fill,anchor=anchor)

def draw_hdd(d, cx, cy, scale=1.0):
    r=int(210*scale)
    d.ellipse((cx-r,cy-r,cx+r,cy+r),fill=(31,43,66),outline=HDD,width=max(3,int(7*scale)))
    for q in (.28,.52,.76):
        rr0=int(r*q); d.ellipse((cx-rr0,cy-rr0,cx+rr0,cy+rr0),outline=(103,116,143),width=2)
    d.ellipse((cx-35*scale,cy-35*scale,cx+35*scale,cy+35*scale),fill=(105,113,128))
    d.line((cx+r*.75,cy-r*.65,cx+r*.05,cy-r*.05),fill=HDD,width=max(5,int(15*scale)))
    d.ellipse((cx+r*.67-14,cy-r*.59-14,cx+r*.67+14,cy-r*.59+14),fill=HDD)
    txt(d,(cx,cy+r+52),"HDD",42,HDD,"ma")

def draw_ssd(d, cx, cy, scale=1.0):
    w=int(470*scale); h=int(260*scale)
    rr(d,(cx-w//2,cy-h//2,cx+w//2,cy+h//2),26,(15,60,59),outline=SSD,width=max(3,int(6*scale)))
    for yy in (-62,62):
        for xx in (-145,0,145):
            rr(d,(cx+xx*scale-52*scale,cy+yy*scale-35*scale,cx+xx*scale+52*scale,cy+yy*scale+35*scale),10,(26,34,48),outline=(65,94,114),width=2)
    rr(d,(cx-62*scale,cy-45*scale,cx+62*scale,cy+45*scale),12,(30,85,120),outline=CYAN,width=3)
    txt(d,(cx,cy),"CTRL",25,CYAN,"mm")
    txt(d,(cx,cy+h//2+52),"SSD",42,SSD,"ma")

def section_kind(title):
    if "HDDとは" in title: return "hdd"
    if "SSDとは" in title: return "ssd"
    if "何が違う" in title: return "compare"
    if "速度" in title: return "speed"
    if "種類" in title: return "types"
    if "容量" in title: return "price"
    if "寿命" in title: return "life"
    if "バックアップ" in title: return "backup"
    if "用途" in title: return "use"
    if "最終" in title: return "final"
    if "第1章" in title: return "storage"
    return "intro"

def keyword(sentence):
    keys=["M.2","NVMe","TLC","QLC","CMR","SMR","TBW","ランダムアクセス","シーケンシャルアクセス","バックアップ","速度","容量","価格","HDD","SSD","NAND","コントローラー","プラッタ","ヘッド","RAM","メモリ","FPS","NAS","USB"]
    return next((k for k in keys if k in sentence), "")

def scene_image(title, sentence, index):
    im=gradient(); d=ImageDraw.Draw(im,"RGBA")
    txt(d,(110,76),title,39,MUTED,"la")
    k=keyword(sentence)
    if k: txt(d,(110,145),k,66,CYAN if k not in ("HDD",) else HDD,"la")
    kind=section_kind(title)
    # decorative grid
    for x in range(80,W,120): d.line((x,230,x,H-100),fill=(255,255,255,8),width=1)
    for y in range(240,H-100,120): d.line((80,y,W-80,y),fill=(255,255,255,8),width=1)
    if kind=="hdd":
        draw_hdd(d,960,510,1.25)
        txt(d,(1420,420),"PLATTER",30,HDD); txt(d,(1420,475),"HEAD / ARM",30,HDD)
    elif kind=="ssd":
        draw_ssd(d,960,510,1.25)
        txt(d,(1400,400),"NAND",34,SSD); txt(d,(1400,458),"CONTROLLER",34,CYAN)
    elif kind=="compare":
        draw_hdd(d,520,505,.9); draw_ssd(d,1390,505,.83)
        txt(d,(960,500),"VS",55,WHITE,"mm")
        if "価格" in sentence or "容量" in sentence:
            for i,v in enumerate([2,4,8,16]): 
                d.rectangle((360+i*75,720-v*9,410+i*75,720),fill=HDD)
            for i,v in enumerate([1,2,4,8]): 
                d.rectangle((1270+i*75,720-v*14,1320+i*75,720),fill=SSD)
    elif kind=="speed":
        labels=[("HDD",HDD,.22),("SATA SSD",SSD,.55),("NVMe SSD",CYAN,.92)]
        y=370
        for name,c,val in labels:
            txt(d,(360,y),name,34,c,"lm"); rr(d,(650,y-24,1500,y+24),22,(31,43,66)); rr(d,(650,y-24,650+850*val,y+24),22,c); y+=130
        if "ランダム" in sentence:
            rng=np.random.default_rng(42)
            for x,y0 in rng.integers([300,300],[1600,720],size=(36,2)):
                d.rectangle((x,y0,x+18,y0+18),fill=(255,255,255,110))
    elif kind=="types":
        if any(x in sentence for x in ["M.2","NVMe","SATA"]):
            txt(d,(960,335),"SSD",58,SSD,"mm")
            for x0,lab,col in [(570,"2.5-inch\nSATA",SSD),(960,"M.2 SATA",CYAN),(1350,"M.2 NVMe",GREEN)]:
                rr(d,(x0-185,470,x0+185,610),24,(22,35,59),outline=col,width=4); 
                for j,line in enumerate(lab.split("\n")): txt(d,(x0,520+j*42),line,31,col,"mm")
            if "同じ意味ではない" in sentence or "必ず" in sentence: txt(d,(960,705),"M.2  ≠  NVMe",58,RED,"mm")
        elif "CMR" in sentence or "SMR" in sentence:
            txt(d,(520,320),"CMR",48,HDD,"mm"); txt(d,(1400,320),"SMR",48,HDD,"mm")
            for j in range(5):
                d.line((300,430+j*55,740,430+j*55),fill=HDD,width=18)
                off=j*24; d.line((1170+off,430+j*55,1610+off,430+j*55),fill=HDD,width=18)
        else:
            draw_ssd(d,540,520,.75); draw_hdd(d,1380,520,.72)
    elif kind=="price":
        for i,(lab,val) in enumerate([("1TB",.18),("2TB",.30),("4TB",.48),("8TB",.70),("16TB",.94)]):
            y=300+i*100; txt(d,(300,y),lab,30,WHITE,"lm"); rr(d,(500,y-20,1450,y+20),18,(29,41,65)); rr(d,(500,y-20,500+900*val,y+20),18,HDD)
        txt(d,(960,835),"大容量ほど「1TBあたりの価格」が重要",38,HDD,"mm")
    elif kind=="life":
        txt(d,(510,330),"SSD",50,SSD,"mm"); txt(d,(1410,330),"HDD",50,HDD,"mm")
        rr(d,(300,420,720,500),20,(27,39,61)); rr(d,(300,420,620,500),20,SSD); txt(d,(510,460),"NAND / TBW",32,WHITE,"mm")
        draw_hdd(d,1410,555,.65)
        txt(d,(510,610),"書き込みによる劣化",30,MUTED,"mm"); txt(d,(1410,780),"機械部品の故障",30,MUTED,"mm")
    elif kind=="backup":
        txt(d,(960,315),"3 - 2 - 1",78,GREEN,"mm")
        items=[(470,"3","コピー"),(960,"2","種類の保存先"),(1450,"1","別の場所")]
        for x0,n,l in items:
            rr(d,(x0-180,440,x0+180,650),26,(22,35,58),outline=GREEN,width=4)
            txt(d,(x0,510),n,72,GREEN,"mm"); txt(d,(x0,600),l,26,WHITE,"mm")
    elif kind=="use":
        names=["OS","GAME","EDIT","ARCHIVE","NAS","EXTERNAL"]
        for i,name in enumerate(names):
            x0=300+(i%3)*620; y0=330+(i//3)*260
            rr(d,(x0-200,y0-80,x0+200,y0+80),28,(22,35,58),outline=SSD if name in ("OS","GAME","EDIT") else HDD,width=4)
            txt(d,(x0,y0),name,40,WHITE,"mm")
    elif kind=="final":
        draw_hdd(d,520,520,.86); draw_ssd(d,1400,520,.8)
        txt(d,(960,510),"+",90,GREEN,"mm")
        txt(d,(960,690),"勝ち負けではなく、使い分け",46,WHITE,"mm")
    elif kind=="storage":
        rr(d,(260,320,760,680),32,(21,34,57),outline=CYAN,width=4); txt(d,(510,420),"RAM",54,CYAN,"mm"); txt(d,(510,515),"作業中",40,WHITE,"mm")
        rr(d,(1160,320,1660,680),32,(21,34,57),outline=SSD,width=4); txt(d,(1410,420),"SSD / HDD",54,SSD,"mm"); txt(d,(1410,515),"保存",40,WHITE,"mm")
    else:
        draw_hdd(d,520,520,.82); draw_ssd(d,1400,520,.76)
        txt(d,(960,505),"SSD と HDD",68,WHITE,"mm")
        txt(d,(960,590),"仕組みから違いを理解する",38,MUTED,"mm")

    # caption panel
    lines=wrap_jp(sentence,30)
    cap_h=78+len(lines)*55
    rr(d,(120,H-cap_h-60,W-120,H-50),28,(4,8,18,215),outline=(255,255,255,28),width=2)
    yy=H-cap_h-26
    for line in lines[:3]:
        txt(d,(960,yy),line,43,WHITE,"ma",True); yy+=55
    # progress
    d.rectangle((0,H-8,int(W*((index+1)/sum(len(x[1]) for x in SECTIONS))),H),fill=CYAN)
    return im

def tts(text, outwav):
    q=requests.post("http://127.0.0.1:50021/audio_query",params={"text":text,"speaker":3},timeout=120)
    q.raise_for_status(); data=q.json()
    data["speedScale"]=1.06; data["intonationScale"]=1.04; data["prePhonemeLength"]=0.08; data["postPhonemeLength"]=0.10
    r=requests.post("http://127.0.0.1:50021/synthesis",params={"speaker":3},json=data,timeout=180)
    r.raise_for_status(); Path(outwav).write_bytes(r.content)

def wav_dur(path):
    with wave.open(str(path),"rb") as w: return w.getnframes()/w.getframerate()

def run(cmd):
    print("+"," ".join(map(str,cmd)),flush=True)
    subprocess.run(list(map(str,cmd)),check=True)

def bgm(duration, path):
    sr=44100; n=int(duration*sr); t=np.arange(n)/sr
    y=np.zeros(n,dtype=np.float32)
    chords=[(110.0,164.81,220.0),(98.0,146.83,196.0),(130.81,196.0,261.63),(87.31,130.81,174.61)]
    block=8.0
    for i in range(int(duration//block)+1):
        a=int(i*block*sr); b=min(n,int((i+1)*block*sr)); tt=t[a:b]
        c=chords[i%len(chords)]
        pad=sum(np.sin(2*np.pi*f*tt + j*.6) for j,f in enumerate(c))/len(c)
        env=(0.75+0.25*np.sin(2*np.pi*tt/block))
        y[a:b]+=0.045*pad*env
    # soft tick/percussion
    for beat in np.arange(0,duration,1.0):
        a=int(beat*sr); L=min(n-a,int(.08*sr))
        if L>0:
            tt=np.arange(L)/sr
            y[a:a+L]+=0.014*np.sin(2*np.pi*120*tt)*np.exp(-tt*38)
    sf.write(path,y,sr)

def make_segment(img,wav,dur,out):
    img.save(str(img_path:=Path(str(out)+".png")))
    # very subtle motion; keep text readable
    vf=f"scale=2048:1152,zoompan=z='min(zoom+0.00010,1.025)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1920x1080:fps={FPS},format=yuv420p"
    run(["ffmpeg","-y","-loglevel","error","-loop","1","-i",img_path,"-i",wav,"-vf",vf,"-t",f"{dur:.3f}","-r",str(FPS),"-c:v","libx264","-preset","veryfast","-crf","18","-c:a","aac","-b:a","192k","-shortest",out])
    img_path.unlink(missing_ok=True)

def silent_title(title, duration, out):
    im=gradient(); d=ImageDraw.Draw(im,"RGBA")
    txt(d,(960,420),title,72,WHITE,"mm")
    txt(d,(960,520),"SSD vs HDD",34,CYAN,"mm")
    rr(d,(650,610,1270,616),3,CYAN)
    p=Path(str(out)+".png"); im.save(p)
    run(["ffmpeg","-y","-loglevel","error","-loop","1","-i",p,"-f","lavfi","-i","anullsrc=r=48000:cl=stereo","-t",str(duration),"-r",str(FPS),"-vf",f"scale={W}:{H},format=yuv420p","-c:v","libx264","-preset","veryfast","-crf","18","-c:a","aac","-b:a","192k","-shortest",out])
    p.unlink(missing_ok=True)

records=[]; clips=[]; current=0.0; idx=0
sub=[]; chapter_lines=[]
for sec_i,(title,sents) in enumerate(SECTIONS):
    if sec_i>0:
        out=WORK/f"title_{sec_i:02d}.mp4"; silent_title(title,1.35,out); clips.append(out); current+=1.35
        chapter_lines.append(f"{int(current//60):02d}:{int(current%60):02d} {title}")
    else:
        chapter_lines.append("00:00 オープニング")
    for sent in sents:
        wav=WORK/f"voice_{idx:04d}.wav"; tts(sent,wav); dur=wav_dur(wav)+0.12
        im=scene_image(title,sent,idx)
        seg=WORK/f"seg_{idx:04d}.mp4"; make_segment(im,wav,dur,seg)
        clips.append(seg)
        st=current; en=current+dur; current=en
        sub.append((idx+1,st,en,sent))
        idx+=1

# fixed outro: 1s hold + 2s fade + 1s blank + title fade/hold total 8s
im=gradient(); d=ImageDraw.Draw(im,"RGBA"); txt(d,(1435,870),'次回「SSDとHDDの歴史」',48,WHITE,"mm")
p=WORK/"next.png"; im.save(p)
outro=WORK/"outro.mp4"
run(["ffmpeg","-y","-loglevel","error","-loop","1","-i",p,"-f","lavfi","-i","anullsrc=r=48000:cl=stereo","-t","8","-vf",f"scale={W}:{H},fade=t=in:st=4:d=1,format=yuv420p","-r",str(FPS),"-c:v","libx264","-preset","veryfast","-crf","18","-c:a","aac","-b:a","192k","-shortest",outro])
clips.append(outro); current+=8

concat=WORK/"concat.txt"; concat.write_text("\n".join(f"file '{x.resolve()}'" for x in clips),encoding="utf-8")
base=WORK/"base.mp4"
run(["ffmpeg","-y","-loglevel","error","-f","concat","-safe","0","-i",concat,"-c","copy",base])

# extract narration/segment audio, generate bgm and mix
bg=WORK/"bgm.wav"; bgm(current,bg)
final=OUT/"ssd_hdd_complete.mp4"
run(["ffmpeg","-y","-loglevel","error","-i",base,"-i",bg,"-filter_complex","[1:a]volume=0.16[bg];[0:a][bg]amix=inputs=2:duration=first:dropout_transition=2[a]","-map","0:v","-map","[a]","-c:v","libx264","-preset","slow","-b:v","9M","-maxrate","12M","-bufsize","24M","-pix_fmt","yuv420p","-c:a","aac","-b:a","256k","-movflags","+faststart",final])

# 720p preview
run(["ffmpeg","-y","-loglevel","error","-i",final,"-vf","scale=1280:720","-c:v","libx264","-preset","veryfast","-crf","24","-c:a","aac","-b:a","160k",OUT/"ssd_hdd_preview.mp4"])
# narration-only extraction
run(["ffmpeg","-y","-loglevel","error","-i",base,"-vn","-c:a","pcm_s16le",OUT/"narration.wav"])

def stamp(t):
    h=int(t//3600); m=int((t%3600)//60); s=t%60
    return f"{h:02d}:{m:02d}:{s:06.3f}".replace(".",",")
with open(OUT/"subtitles.srt","w",encoding="utf-8") as f:
    for n,st,en,s in sub:
        f.write(f"{n}\n{stamp(st)} --> {stamp(en)}\n{s}\n\n")
(OUT/"chapters.txt").write_text("\n".join(chapter_lines),encoding="utf-8")
print("DONE",final,"duration",current,"sentences",idx)
