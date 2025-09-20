# HexViewer

HexViewer は Kaitai Struct のスキーマ（KSY）をブラウザ上で適用し、任意のバイナリの構造を可視化するための実験的ツールです。`app/` ディレクトリに Vite + React 製のシングルページアプリとして実装されています。

## リンク

* デモ（GitHub Pages）: https://pun2beam.github.io/HexViewer/
* 詳細仕様: [`HexViewerSpec.md`](./HexViewerSpec.md)
* Kaitai Struct 解説: [`KSY_guide.md`](./KSY_guide.md)

## 主な機能

* ローカルファイルまたはサンプルデータの読み込み
* KSY テキストの入力とブラウザ内コンパイル（`kaitai-struct-compiler` を使用）
* 解析結果ツリーと Hex/ASCII ダンプの同期表示
* ノード詳細の表示（型・レンジ・値・属性）
* Hex 列数の切替とアドレスジャンプ（16 進／10 進）

より詳しい挙動や制約は仕様書を参照してください。

## 開発

実装や開発手順は `app/README.md` を参照してください。

```
cd app
npm install
npm run dev
```

