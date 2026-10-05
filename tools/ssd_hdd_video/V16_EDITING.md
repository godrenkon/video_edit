# SSD/HDD V16: 説明に合わせた編集

V15の4秒ごとの素材差し替えと隣接素材の重複禁止は、同じ説明が続いていても別の写真へ切り替わる原因になっていた。V16は122文それぞれに表示対象と図解を指定し、文の開始・終了時刻に合わせて編集する。背景のタイマー変更、キーワードによる素材の自動選択、写真の常時ズームは使用しない。

## 画面と説明

- 明るい背景、直角の白いカード、濃い文字に統一。
- 写真は縦横比を保って配置。説明箇所を示す矢印、比較図、処理順の図を使う。
- HDDのヘッドとプラッタは実物写真で示し、動作説明では確認済みの実写動画240〜260秒付近を使用する。
- M.2の取り付け例は実際のSamsung 960 EVOの写真に変更。NVMeとM.2を同じ分類として扱わない。
- コントローラが見えない写真にはコントローラの矢印を付けず、構成図で説明する。
- ずんだもんは右側の同じ位置・同じ高さに固定。周期的な上下動や左右移動は行わない。
- 全画面に白い四角い字幕ボックスを確保。V15の確認済み488字幕キューの時刻を継承し、拡大・飛び出し演出を削除。
- 既存の修正版ナレーションを継承。文のハッシュが変わった場合は、対応する絵コンテの再編集を要求する。

## 実行

必要な入力は実素材フォルダ、修正版音声、確認済み字幕、4種類のずんだもん立ち絵、Noto Sans CJK Bold。旧V15のrestore/patch処理ではなく、この独立したレンダラを使う。

```bash
python3 tools/ssd_hdd_video/test_authored.py
python3 tools/ssd_hdd_video/render_authored.py \
  --assets real_assets --voice voice --poses zundamon_poses \
  --font fonts/NotoSansCJK-Bold.ttc --out authored_video_output
```

音声フォルダには `SSD_HDD_NARRATION_ZUNDAMON_48k.wav`、`narration_timestamps.tsv`、`subtitles_source.ass` が必要。`subtitles_source.ass` はV15 QAの `subtitles_green_v15.ass` のコピー。素材の追加分は同じ素材フォルダに配置し、`ATTRIBUTION_EXTRA.md` も保持する。

`--plan-only` で全画面を生成し、`--start 180 --seconds 60` などで区間を書き出せる。出力は1920×1080、60fps、48kHzステレオ。文と素材の対応は `authored_storyboard_v16.json`、実時刻付きの一覧は出力先の `storyboard.tsv` に記録する。

## 参考の確認範囲

参考動画の一部は取得できず、何百本もの動画を視聴確認したわけではない。以下の解説記事と取得できた動画由来の画面を確認し、字幕の視認性、部品の実物確認、説明と図の対応に反映した。

- Adobe: [YouTubeテロップを作る5つのポイントと効果的な入れ方](https://www.adobe.com/jp/creativecloud/roc/blog/video/telop.html)
- 制作者の記事: [ずんだもん動画の制作解説](https://note.com/kokoshiridouga/n/n48cd840e4d91)
- 動画由来の工作・SSDケース組立画面: [ニコニコニュース オリジナル](https://originalnews.nico/480476)
- 用語確認: [CFD SSD解説](https://www.cfd.co.jp/article/ssd/detail/details0001.html)、[Kingston用語集](https://www.kingston.com/unitedkingdom/jp/memory/kingston-glossary)

素材の作者・ライセンスは書き出し先の `ATTRIBUTION.md` に併記する。
