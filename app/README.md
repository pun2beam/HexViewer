# HexViewer Web

HexViewer Web は [`HexViewerSpec.md`](../HexViewerSpec.md) の要件に沿って実装されたブラウザ向けバイナリビューアです。Kaitai Struct の KSY をその場でコンパイルし、解析結果ツリーと Hex ダンプを同期させて表示します。

## 主な機能

- **ファイル読込**: ローカルファイルを開くほか、ワンクリックでサンプルバイナリとサンプル KSY を適用できます。【F:app/src/components/TopBar.tsx†L34-L105】
- **KSY パーサ**: テキストエリアに入力した YAML を `kaitai-struct-compiler` に渡し、ブラウザ内で AST を構築します。【F:app/src/components/KsyEditor.tsx†L1-L20】【F:app/src/utils/kaitaiParser.ts†L1-L214】
- **構造ツリー ⇄ Hex 同期**: ノード選択とバイト選択を双方向に同期し、最小包含ノードを推測します。【F:app/src/components/TreePanel.tsx†L1-L140】【F:app/src/components/HexPane.tsx†L170-L215】【F:app/src/state/sessionStore.ts†L132-L167】
- **ビュー調整**: Hex 列数の切替、16 進／10 進アドレスジャンプ、選択レンジ表示を提供します。【F:app/src/components/TopBar.tsx†L88-L101】【F:app/src/components/HexPane.tsx†L70-L132】
- **ステータス表示**: ファイルサイズやカーソル位置をフッターに表示します。【F:app/src/App.tsx†L11-L37】

## 制限事項 / 今後の拡張余地

- Hex/ASCII の編集 UI は未実装です（`editByte` アクションは内部的に存在）。【F:app/src/state/sessionStore.ts†L171-L188】
- 解析はメインスレッドで行われるため、巨大ファイルでは UI がブロックされる場合があります。
- `_debug` 情報が無効化された KSY ではレンジ算出ができないため AST が生成できません。【F:app/src/utils/kaitaiParser.ts†L215-L334】
- 注釈やセッション保存の UI は未提供ですが、型定義のみ存在します。【F:app/src/types.ts†L25-L48】

## Kaitai Struct Compiler について

- 公式 npm パッケージ `kaitai-struct-compiler@0.11.0` を依存関係として追加しており、`npm install` のみで取得します。【F:app/package.json†L14-L21】
- ソースコードでは `compileKsySource` 経由で `KaitaiStructCompiler.compile("javascript", schema, importer, true)` を呼び出し、追加ビルドは不要です。【F:app/src/utils/kaitaiCompiler.ts†L1-L44】
- 生成された JavaScript モジュールを `createModuleCache` でメモリ上に読み込んで実行します。【F:app/src/utils/kaitaiParser.ts†L74-L214】

## 開発環境

```bash
npm install
npm run dev
```

ブラウザで <http://localhost:5173/> を開きます。

### ビルド

```bash
npm run build
```

成果物は `dist/` に出力されます。

### Lint

```bash
npm run lint
```

