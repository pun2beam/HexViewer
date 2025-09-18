# HexViewer Web

HexViewer Web is a browser-based binary inspector inspired by the requirements in `HexViewerSpec.md`. It allows you to load arbitrary files, attach a simplified Kaitai Struct schema, and explore the parsed structure alongside a synchronized hex dump.

## 主な機能

- **ファイル読込**: ファイル選択またはサンプルデータで即座に動作を確認可能。
- **KSYパーサ**: YAML形式のKSYをブラウザ内で解析し、ASTツリーを生成。`size`・`pos`・ネストした型参照の基本式をサポートします。
- **構造ツリー ⇄ Hex同期**: ツリー選択でダンプをハイライトし、ダンプ側のクリックで最適なノードを自動選択。
- **Hex/ASCII編集**: 1バイト単位で編集すると即座に再パース。Undo/Redoにも対応。
- **セッション保存/復元**: 現在のファイル・KSY・ビュー状態をJSONでエクスポート／インポート。
- **表示調整**: Hex列数（16/24/32）切替、ライト/ダーク自動切替、詳細ペインによる値確認。

## 開発環境

```bash
npm install
npm run dev
```

Visit http://localhost:5173/ in your browser.

### ビルド

```bash
npm run build
```

成果物は `dist/` に出力されます。

### Lint

```bash
npm run lint
```

## 制限事項 / 今後の拡張余地

- Kaitai Struct の全機能を網羅していません。`repeat`、`switch`、`instances` などは未対応です。
- 巨大ファイルの編集はバイト配列コピーのため負荷が高くなる場合があります。
- Undo/Redo は上書き編集のみ対応しています（挿入・削除は非対応）。
- 注釈UIは内部データモデルのみに保持しています。

仕様の詳細はリポジトリ直下の `HexViewerSpec.md` を参照してください。
