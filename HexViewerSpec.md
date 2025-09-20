# HexViewer Web 仕様書

本書はリポジトリ `app/` 配下で実装されているブラウザ版 HexViewer の現行挙動をまとめたものです。`HexViewer` は Kaitai Struct 形式のスキーマ（KSY）をブラウザ上で読み込み、ローカルの任意バイナリを解析して構造ツリーと Hex ダンプを同期表示するツールです。

---

## 1. 目的と非目標

### 目的

1. ローカルファイルまたはサンプルバイナリを読み込み、ブラウザ内で完結して解析する。
2. YAML 形式の KSY を入力し、その場で Kaitai Struct Compiler を呼び出してパーサを生成する。
3. 解析結果の AST（構造ツリー）と Hex/ASCII ダンプを双方向に同期させて閲覧する。
4. 解析結果のメタ情報（値、オフセット、属性など）をノード詳細として確認する。
5. Hex 表示の列数やジャンプ操作など、閲覧に必要な最小限のビュー調整を提供する。

### 非目標（2025-02 現在）

* Hex/ASCII の直接編集、差分再パース、Undo/Redo は未実装。
* Web Worker や SharedArrayBuffer を用いたマルチスレッド処理は未導入。解析はメインスレッドで行われる。
* 注釈・ブックマーク・セッション書き出しなどの永続化 UI は未実装（データモデルのみ存在）。
* `repeat` や `switch` などの基本構文は扱うが、Kaitai Struct の全機能（`instances` の値追跡、`io` の切替等）を完全にはサポートしない。
* 巨大ファイルに対するパフォーマンス保証（60fps など）は将来課題。

---

## 2. ユースケース

* バイナリファイルを開き、既存の KSY を貼り付けて解析結果を確認する。
* サンプルデータとサンプル KSY を読み込み、機能をすぐに試す。
* 構造ツリーでフィールドを選択し、Hex ダンプ側で対応範囲を確認する。
* Hex ダンプ側で任意バイトをクリックし、そのバイトをカバーする最小ノードを特定する。
* バイトオフセットを 16 進／10 進で入力し、該当位置にジャンプする。

---

## 3. UI レイアウト

```
┌──────────────────────────────────────────────┐
│ TopBar：ファイル操作／KSY 適用／Hex 列数切替                        │
├───────────────┬───────────────────────────────┤
│ 左ペイン                                   │ 右ペイン                 │
│  ├ TreePanel：構造ツリー＋ノード詳細       │  HexPane：Hex/ASCII 表示 │
│  └ KsyEditor：KSY テキストエリア            │  （スクロール仮想化＋ジャンプ）│
├──────────────────────────────────────────────┤
│ StatusBar：ファイルサイズ／カーソル／選択範囲／バッファ状況           │
└──────────────────────────────────────────────┘
```

### TopBar

* 「ファイルを開く」：`<input type="file">` をラップ。選択後 `loadFile` アクションを実行。
* 「サンプル読み込み」：ハードコードされた 32 バイトのサンプルバッファと簡易 KSY を適用。【F:app/src/components/TopBar.tsx†L34-L64】【F:app/src/components/TopBar.tsx†L66-L105】
* 「KSY 適用」：現在のテキストを `applyKsy` に渡す。空文字列のときは disabled。【F:app/src/components/TopBar.tsx†L68-L87】
* Hex 列数切替：16/24/32 を `<select>` で切替え、Zustand ストアの `hexCols` を更新。【F:app/src/components/TopBar.tsx†L88-L101】
* メタ表示：読み込んだファイル名とサイズ、最新の解析エラー 1 件を表示。【F:app/src/components/TopBar.tsx†L102-L110】

### 左ペイン

* TreePanel：AST をネストしたリストとして描画。階層ごとに折り畳み可能。ノードをクリックすると選択状態がストアに反映され、対応レンジが HexPane に通知される。【F:app/src/components/TreePanel.tsx†L1-L74】【F:app/src/components/TreePanel.tsx†L101-L140】
* ノード詳細：選択中ノードの型名、オフセット、長さ、値、属性を整形表示。【F:app/src/components/TreePanel.tsx†L40-L72】
* KSY エディタ：Monaco 等は使わず、`<textarea>` によるシンプルな入力欄。ストアの `ksySource` を双方向バインド。【F:app/src/components/KsyEditor.tsx†L1-L20】

### 右ペイン（HexPane）

* スクロール仮想化：1 行 24px、高さ計算による単純な仮想リストでレンダリングコストを抑制。【F:app/src/components/HexPane.tsx†L12-L68】【F:app/src/components/HexPane.tsx†L133-L169】
* Hex/ASCII 列：同一行に Hex と ASCII を並べ、ボタンとして表示。クリックで指定バイトを `selectRange` に渡し、長さ 1 のレンジを選択する。【F:app/src/components/HexPane.tsx†L170-L215】
* 選択ハイライト：選択レンジとキャレットをクラスで装飾し、Hex/ASCII 双方に反映。【F:app/src/components/HexPane.tsx†L175-L215】
* アドレスジャンプ：16 進／10 進のラジオボタンで入力基数を切替。バリデーション後、対象行へスクロール。【F:app/src/components/HexPane.tsx†L70-L132】
* ステータス表示：現在の選択範囲を `選択: start - end (length bytes)` 形式で表示。【F:app/src/components/HexPane.tsx†L115-L132】

### StatusBar

ファイルサイズ、キャレット位置、選択レンジ、バッファ長を表示。【F:app/src/App.tsx†L11-L37】

---

## 4. データモデル

TypeScript 型は `app/src/types.ts` に定義される。【F:app/src/types.ts†L1-L48】

* `Range`：`{ start, length }`。選択レンジやノード範囲の基本単位。
* `AstNode`：ノード ID・名前・型名・レンジ・値・属性・子ノードを保持。`parseWithKsy` が `_debug` 情報から生成する。
* `ParseResult`：ルートノード、平坦化済みノード配列、警告・エラー配列を含む。
* `Annotation`／`SessionData`：将来的な注釈・セッション保存用に定義されているが UI は未実装。

---

## 5. ステート管理

Zustand（`persist` ミドルウェア付き）で単一ストアを構築する。【F:app/src/state/sessionStore.ts†L1-L32】

主なアクション：

* `loadFile(file)`：`File` を `ArrayBuffer` に読み込み、SHA-256 を計算してメタ情報を構築。完了後 `setBuffer` を呼び出す。【F:app/src/state/sessionStore.ts†L34-L60】
* `setBuffer(data, meta)`：バッファをクローンしてストアに保存。KSY が入力済みの場合は自動で `applyKsy` を再実行する。【F:app/src/state/sessionStore.ts†L62-L75】
* `setKsySource(source)`：KSY テキスト更新のみ。【F:app/src/state/sessionStore.ts†L77-L80】
* `applyKsy(source?)`：最新の KSY とバッファから `parseWithKsy` を呼び出す。成功時はルートノードを初期選択とし、失敗時は `errors` にメッセージを格納。【F:app/src/state/sessionStore.ts†L82-L130】
* `selectNode(node)`：ノード選択に応じて `selectedRange` と `caret` を更新。【F:app/src/state/sessionStore.ts†L132-L142】
* `selectRange(range)`：レンジ選択に応じて最小包含ノードを探索し、`selectedNodeId` を更新。探索は `flatNodes` の線形フィルタと長さ昇順ソートによる単純実装。【F:app/src/state/sessionStore.ts†L144-L167】
* `setHexCols(cols)`：Hex 表示列数の更新。【F:app/src/state/sessionStore.ts†L169-L169】
* `editByte`：1 バイト上書き後に再パースを試みるロジックがあるが、UI からはまだ呼び出されない。【F:app/src/state/sessionStore.ts†L171-L188】

`persist` の設定により、`ksySource` と `hexCols` をローカルストレージへ保存する。【F:app/src/state/sessionStore.ts†L190-L198】

---

## 6. 解析エンジン

`parseWithKsy` は以下の手順で AST を生成する。【F:app/src/utils/kaitaiParser.ts†L1-L214】【F:app/src/utils/kaitaiParser.ts†L215-L334】【F:app/src/utils/kaitaiParser.ts†L335-L466】【F:app/src/utils/kaitaiParser.ts†L467-L540】

1. `compileKsySource` で KSY を Kaitai Struct Compiler に渡し、JavaScript モジュール群を生成。
2. AMD 形式のコードを動的ロードするため、簡易モジュールローダ（`createModuleCache`）を実装。
3. 生成された Root クラスに `KaitaiStream` を渡してパースし、各 `_debug` 情報からノード範囲を抽出。
4. `buildFields` と `buildNode` で AST を再帰的に構築。`repeat` 配列は親ノードとしてまとめ、子要素を `field.id[index]` 形式で表現。
5. ノード値はプリミティブ・配列のみを保持し、複合オブジェクトは `_debug` ベースで子ノードへ展開。
6. 生成したツリーを `flatten` で一次配列化し、`selectRange` からの逆引きに利用。

エラーハンドリング：

* KSY コンパイル時の例外は `KaitaiCompilationError` にラップし、コンパイラが返す `CompilationProblem` から座標等を抽出してメッセージ整形。【F:app/src/utils/kaitaiParser.ts†L467-L540】
* パース例外（ルートクラス未生成、`_read` 内のエラー等）は `ParseResult.errors` に反映。

---

## 7. Kaitai Struct Compiler の取得方法

* 公式 npm パッケージ `kaitai-struct-compiler@0.11.0` を依存関係として追加し、Vite によってバンドルしている。【F:app/package.json†L14-L21】【F:app/package-lock.json†L2593-L2604】
* ソースコードでは `import KaitaiStructCompiler from "kaitai-struct-compiler";` として読み込み、`KaitaiStructCompiler.compile("javascript", schema, importer, true)` を実行するだけで、追加ビルドステップは不要。【F:app/src/utils/kaitaiCompiler.ts†L1-L44】
* これにより Kaitai Struct Compiler の Java 実装を wasm 化した公式ビルドをそのまま利用しており、リポジトリ内で独自ビルドやパッチは行っていない。必要なのは `npm install` で依存を取得することのみである。

---

## 8. ファイル入出力とメタデータ

* バッファ読み込み時に Web Crypto API で SHA-256 を計算し、`SessionFileMeta` として保持。【F:app/src/state/sessionStore.ts†L42-L56】
* `StatusBar` にはファイルサイズ・カーソル位置・選択範囲・バッファ長を表示し、現在の解析状況を把握できる。【F:app/src/App.tsx†L11-L37】
* セッション保存の UI は無いが、型定義と状態に `annotations` や `caret` が用意されており、将来拡張を想定している。【F:app/src/state/sessionStore.ts†L10-L23】【F:app/src/types.ts†L25-L48】

---

## 9. 既知の制限

* HexPane の仮想スクロールは単純な絶対配置のため、数十 MB を超える巨大ファイルではスクロール位置の浮動小数誤差が発生する可能性がある。
* `_debug` 情報に依存しているため、KSY で `debug: false` が設定された場合は AST の構築が行えない。
* `repeat-until` のような条件付きループは `_debug` の配列情報が揃っている場合のみ対応できる。
* 解析処理がメインスレッドで同期実行されるため、大きなファイルや複雑なスキーマを扱うと UI がブロックされる。
* 現状の UI からは `editByte` が呼ばれず、Hex/ASCII の表示は参照専用となる。

---

## 10. ビルドと開発

* 依存関係のインストール：`npm install`
* 開発サーバ：`npm run dev` → `http://localhost:5173/`
* ビルド：`npm run build`
* Lint：`npm run lint`

これらのコマンドは `app/README.md` にも記載されている。【F:app/README.md†L15-L38】

