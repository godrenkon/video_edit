# Suiram Video Edit

ブラウザだけで動く、高性能な個人用ノンリニア動画編集環境を目指すプロジェクトです。Adobe Premiere Pro / DaVinci Resolve のようなデスクトップ編集ソフトの主要ワークフローを、Chrome + AWS Amplify Hosting で完結させることを長期目標にしています。

> 現在: **Foundation / v0.1**。編集UI、素材管理、タイムライン、プレビュー、OPFS保存、ずんだもん自動口パクの初期実装まで。

## v0.1で実装済み

- Vite + React + TypeScript の編集アプリ基盤
- 動画 / 音声 / 画像の素材読み込み
- OPFS（Origin Private File System）への素材保存
- プロジェクトJSONの自動保存
- メディアライブラリ
- 複数トラックのタイムライン
- クリップの配置、移動、右端トリム
- 再生 / 一時停止 / シーク
- 画像・動画プレビュー
- 音声クリップ再生
- 位置 / 拡大率 / 回転 / 不透明度 / 音量のインスペクター
- トラックのミュート / ロック
- ずんだもん機能
  - 口閉じ / 半開き / 開き / 瞬きPNGの指定
  - VOICEVOX等の音声を端末内解析
  - RMSベースの自動口パクキュー生成
  - 自動瞬き
  - ふわふわ上下移動
  - 音声クリップと立ち絵クリップを自動でタイムラインへ配置
- ブラウザ機能診断（WebCodecs / OPFS / WebGPU / OffscreenCanvas / cross-origin isolation）
- Amplify向け `amplify.yml`
- SharedArrayBuffer / WASMマルチスレッドを見据えた `customHttp.yml`
- `.sveproj.json` のプロジェクトバックアップ出力

## 開発

```bash
npm install
npm run dev
```

本番ビルド:

```bash
npm run build
```

## Amplify Hosting

このリポジトリをAmplifyへ接続すれば `amplify.yml` が利用されます。

- build: `npm run build`
- artifact: `dist`
- 静的配信のみでも動作
- 素材自体はユーザーのブラウザ内OPFSへ保存されるため、S3/Lambdaへ動画素材を送らない構成を基本とする

## 方針

編集時の大容量データはサーバーへアップロードせず、可能な限りブラウザ内で処理します。これによりAmplify側の転送量・バックエンド処理費を抑えます。

最終的なレンダリングエンジンは WebCodecs + Worker + OffscreenCanvas を中心にし、WebGPUは対応端末でのみ高速化に利用します。互換性が必要な処理は Canvas/WebGL/WASMへフォールバックします。

詳細は `docs/ARCHITECTURE.md` と `docs/ROADMAP.md` を参照してください。
