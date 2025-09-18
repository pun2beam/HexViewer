# 仕様書：Kaitai Struct バイナリエディタ（Web）

## 0. 用語

* **KSY**：Kaitai Struct のスキーマ（YAML）
* **パース結果ツリー（AST）**：KSYに基づく各フィールドの階層構造
* **レンジ**：バイナリ内のオフセット範囲 `[start, end)`（バイト単位）
* **ノード**：ツリー上の1要素（フィールド／型）
* **セッション**：ファイル＋適用KSY＋注釈＋ビュー状態の集合

---

## 1. ゴール／非ゴール

### ゴール

1. 任意バイナリを**ブラウザ内**で読み込み、指定KSYで解析してツリー表示。
2. ツリー選択⇔ダンプ強調を**双方向同期**。
3. バイナリの**編集（16進/ASCII）→差分再パース**、Undo/Redo。
4. 巨大ファイル（～数百MB）で**スクロール60fps級**の快適さ。
5. スキーマの切替、複数スキーマの候補適用、バージョン管理。
6. 注釈（コメント・タグ・色）と**セッション保存/復元**。

### 非ゴール（初期版）

* 圧縮形式の自動展開（.zip/.gzなど）は後続拡張。
* 逆アセンブリ/デコンパイルは対象外。
* ネットワーク越しのサーバ実行は行わず**完全ローカル**（PWA化は将来対応）。

---

## 2. ユースケース（抜粋）

* UC-01：ユーザがバイナリをドラッグ&ドロップ→KSY選択→解析→閲覧。
* UC-02：ツリーで`header.magic`をクリック→右ペインで該当4バイトが強調。
* UC-03：右ペインで範囲選択→該当するノードが自動ハイライト（複数候補はリスト）。
* UC-04：バイトを書き換え→差分再パース→ツリーの該当部分のみ更新。
* UC-05：特定オフセットに注釈・色付け→セッションに保存。
* UC-06：KSYを編集（内蔵エディタ）→ホットリロード→再パース。
* UC-07：検索（パターン/文字列/ノード名/Enum値）でヒット箇所巡回。

---

## 3. UI/UX 仕様

### 3.1 レイアウト

* **左ペイン（幅可変、デフォ40%）**：

  * 構造ツリー（折り畳み／フィルタ／ノード検索）
  * ノード詳細（型・サイズ・エンディアン・値表示・Enum/Flagsの意味）
  * KSYエディタ（タブ）／スキーマギャラリー
* **右ペイン（幅可変、デフォ60%）**：

  * バイナリダンプ（Hex + ASCII、**行長16/24/32切替**）
  * 強調表示（選択ノード色・ホバー色・注釈色のレイヤ合成）
  * 編集（上書き/挿入/削除は設定で制約可）
  * 検索バー（Hex/ASCII/正規表現/バイトパターン）
* **上部バー**：ファイル操作、KSY選択、再パース、Undo/Redo、セッション保存/読込、設定
* **下部ステータス**：カーソルオフセット、選択長、エンディアン、ファイルサイズ、パース時間

### 3.2 操作

* クリック：ツリー⇔ダンプ相互選択、シングルクリックでノード/レンジ選択
* ドラッグ：ダンプ範囲選択（シフトで拡張）、スクロールは仮想化
* ホバー：ツールチップ（ノード名・型・サイズ・オフセット）
* コンテキストメニュー：ジャンプ、固定マーク（Pin）、注釈、ブックマーク、可視範囲にズーム
* キーバインド（例）：

  * `Ctrl+O` 取込、`Ctrl+S` セッション保存、`Ctrl+F` 検索、`Ctrl+Z/Y` Undo/Redo
  * `F` 選択フィット、`G` オフセットジャンプ、`[`/`]` 隣接ノードへ

### 3.3 表示・アクセシビリティ

* カラースキーム：ライト/ダーク、色弱配慮パレット
* フォント：等幅（ASCII部）、サイズ変更（90–160%）
* キーボード操作完備とARIA属性付与

---

## 4. データモデル（TypeScript）

```ts
type ByteOffset = number;       // 0-based
type ByteLength = number;

interface Range { start: ByteOffset; length: ByteLength } // [start, start+length)

interface AstNodeId = string;   // "type.header.magic" 等の安定識別子

interface AstNode {
  id: AstNodeId;
  name: string;                 // KSY側のid
  typeName: string;             // u4 / str / custom type
  range: Range;
  endian?: "le" | "be";
  value?: unknown;              // 既知型は整形値を格納
  children?: AstNode[];
  attributes?: Record<string, unknown>; // enum名/flags/if式の評価など
  errors?: ParseError[];
}

interface ParseResult {
  root: AstNode;
  indexByOffset: IntervalIndex<AstNodeId>; // Range→Nodeのインデックス
  warnings: string[];
  errors: ParseError[];
}

interface Annotation {
  id: string;
  range: Range;
  color?: string;      // CSS color
  label?: string;
  note?: string;
  tags?: string[];
  createdAt: number;
}

interface Session {
  fileMeta: { name: string; size: number; sha256: string };
  ksySource: string;            // 現在のKSY（生）、または参照URL＋バージョン
  viewState: { hexCols: 16|24|32; caret: ByteOffset; zoom?: Range };
  annotations: Annotation[];
  edits: EditOp[];              // 適用済み差分ログ
}

type EditOp =
  | { kind: "overwrite"; at: ByteOffset; data: Uint8Array }
  | { kind: "insert"; at: ByteOffset; data: Uint8Array }
  | { kind: "delete"; at: ByteOffset; length: ByteLength };
```

---

## 5. 同期仕様（選択・強調の双方向）

* **選択の単一ソース**：`SelectionState = { nodeId?: AstNodeId; range?: Range }`
* 左→右：ツリーで`nodeId`変更→`range`をルックアップ→右ペイン強調・オートスクロール。
* 右→左：ダンプで`range`選択→`indexByOffset.query(range)`で最小被覆ノード群を取得→最も深いノードを選択、候補はポップアップで切替可能。
* 同期遅延：UI応答性のため**50–75ms**デバウンス。

---

## 6. 解析エンジン

### 6.1 技術選択

* **Kaitai Struct Compiler** で KSY → JS/TS（またはWebAssembly）へコンパイル。
* **kaitai-struct-runtime**（JS）をバンドル。
* 解析実行は **Web Worker**（別スレッド）で実施し、UIはノンブロッキング。
* 大容量対応のため入力は **SharedArrayBuffer** / **File.slice()** / **Blob.stream()** を活用。

### 6.2 差分再パース

* 編集ログ（`EditOp[]`）を適用した**仮想バッファ層**でReaderを構成。
* ノードの依存性を`range`単位で管理し、編集レンジと交差する**最小サブツリー**のみ再パース。
* それ以外はパース結果をキャッシュ再利用。
* フィールド長がヘッダ等に依存する場合は**上位ノード**も巻き戻し対象。

### 6.3 エラーハンドリング

* 解析時例外はノードに`errors`を集約。UIは該当レンジを赤ハッチ表示。
* 致命エラー（magic不一致等）は**代替KSYの提案**（ギャラリー候補）をUIで提示。

---

## 7. バイナリダンプ（Hexビュー）

* **仮想スクロール**：可視範囲のみCanvas描画（1行＝オフセット＋Hex群＋ASCII）。
* **行長**：16/24/32列、行頭のオフセット表記は 8/16桁切替。
* **強調レイヤ**：

  1. 選択ノード色、2) ホバー、3) 注釈、4) 検索ヒット、5) 変更済み（dirty）
     レイヤは優先順位＋αブレンドで合成。
* **編集モード**：

  * Hex側：`[0-9A-Fa-f]`2桁で1バイト上書き。
  * ASCII側：制御文字は`.`表示、入力は対応バイトに反映。
  * **挿入/削除**はコマンド（メニュー/ショートカット）で発動、可否は設定制御。
* **ジャンプ**：オフセット直指定・相対（`+0x100`）・ノードへジャンプ。

---

## 8. スキーマ（KSY）管理

* **読み込み**：ローカル（drag\&drop / ファイル選択）、URL、内蔵ギャラリー。
* **編集**：左ペインのKSYタブにMonaco Editorを内蔵（YAML構文強調・スキーマ補助）。
* **検証**：保存時に KSY 構文チェック→コンパイル→ホットリロード。
* **バージョン**：セッションに KSY のハッシュ/メタデータを保存。
* **複数候補**：`magic`やサイズなどの簡易判定で候補を提示、ユーザ選択で適用。

---

## 9. 検索・可視化

* **バイト検索**：Hexパターン / ASCII / 正規表現 / ワイルドカード（`??`=1byte任意）
* **ノード検索**：名前・型・Enum名・値（例：`header.version=3`）
* **データ型ビューワ**：

  * 整数（符号/エンディアン切替、10/16進表示）
  * 浮動小数（単/倍精度）
  * 文字列（エンコーディング：ASCII/UTF-8/Shift\_JIS 等）
  * 日付時刻（UNIX epoch/FILETIME等）
* **可視化補助**：範囲に「ルーラー」「ブロック境界」「パディング位置」を重ね描画。

---

## 10. 永続化・インポート/エクスポート

* **セッション保存**：`*.kssession.json`

  * `fileMeta`（sha256, size, name）, `ksySource` or `ksyUrl+hash`, `annotations`, `edits`, `viewState`
* **書き出し**：

  * 編集後バイナリ（`*.bin`）
  * 選択範囲の抽出（`range.bin`）
  * ツリー/ノード一覧（CSV/JSON）
* **読み込み検証**：`sha256`一致チェック（異なる場合は警告＋継続可）。

---

## 11. 性能要件

* 100MBファイルで

  * 初回パース：< 2s（PCクラス、Worker/Wasmtime/差分無効時の目安）
  * スクロール：> 55fps（可視域のみCanvas描画、1フレーム<16ms）
  * 差分再パース：小規模編集で < 200ms
* メモリ：バッファ複製を避け、**零コピー参照**（ArrayBufferスライス/SharedArrayBuffer）を優先。

---

## 12. セキュリティ/プライバシ

* すべてローカル（ブラウザ）で完結。外部送信なし。
* PWA対応（将来）：オフラインで動作、キャッシュ制御厳格化。
* KSYの`pos`/`process`等で無限ループの危険を抑制（**ガード：最大反復回数・最大深度**）。

---

## 13. 拡張点（プラグインAPI 概要）

```ts
interface Plugin {
  id: string;
  contributes?: {
    nodePanels?: Array<(node: AstNode, ctx: PluginCtx) => ReactNode>;
    commands?: Array<{ id: string; title: string; run(ctx: PluginCtx): Promise<void> }>;
    detectSchemas?: Array<(fileMeta, buffer) => Promise<KsyCandidate[]>>;
  };
}
```

* 例：CRC計算器、可視化（波形/画像プレビュー）、暗号鍵推定、圧縮展開支援など。

---

## 14. イベント/IPC（UI ⇄ Worker）

```ts
// UI -> Worker
type MsgToWorker =
  | { t: "LOAD_FILE"; buf: SharedArrayBuffer; meta: FileMeta }
  | { t: "APPLY_KSY"; ksy: string }
  | { t: "REPARSE_DIFF"; edits: EditOp[] }
  | { t: "QUERY_RANGE"; range: Range }
  | { t: "CANCEL"; token: string };

// Worker -> UI
type MsgFromWorker =
  | { t: "PARSE_DONE"; result: ParseResult; timeMs: number }
  | { t: "PROGRESS"; phase: "compile"|"parse"; pct: number }
  | { t: "ERROR"; message: string; nodePath?: string }
  | { t: "RANGE_OWNERS"; owners: AstNodeId[] };
```

* 複数同時要求に備え**token**でキャンセル制御。

---

## 15. テスト計画

* **ユニット**：KSYコンパイル、差分再パース、IntervalIndex、Hex描画器。
* **スナップショット**：代表的フォーマット（PNG/ELF/RIFF/ISOBMFF）でAST一致性。
* **プロパティテスト**：編集→Undo/Redo→再パースでASTの整合維持。
* **パフォ計測**：Lighthouse＋customベンチ、長尺ファイルでfps/遅延記録。

---

## 16. 技術スタック（提案）

* **言語/フレームワーク**：TypeScript、React（またはSolid）
* **描画**：Canvas 2D（Hexビュー専用レンダラ）
* **コードエディタ**：Monaco（KSY/JSON）
* **ビルド**：Vite
* **解析**：kaitai-struct-compiler（事前/動的）、kaitai JS runtime、Web Worker
* **状態管理**：Zustand/Redux Toolkit いずれか
* **永続化**：IndexedDB（セッション/KSYキャッシュ）
* **暗号**：SubtleCrypto(SHA-256)

---

## 17. 画面フロー（初期版）

1. 起動 → ウェルカム画面（最近のセッション・KSYギャラリー）
2. ファイル投入 → KSY選択/自動推奨 → 解析進捗バー → エディタ画面
3. ツリー操作・検索・編集 → 注釈 → セッション保存 or 書き出し

---

## 18. 初期リリースのMVP範囲

* 読み込み / KSY適用 / ツリー⇔ダンプ同期 / 上書き編集 / Undo/Redo / 検索 / セッション保存
* 差分再パース（上位ノード巻戻し含む基本形）
* 注釈・ブックマーク・ライト/ダークテーマ

**次期**：挿入/削除、プラグイン、画像/波形プレビュー、PWA、複数ファイルの相互参照、圧縮対応。

---

## 19. 受け入れ基準（抜粋）

* 100MBのELF/MP4でスクロールがカクつかない（60fpsに近い体感）。
* `header.magic`クリックで 100ms以内に該当レンジへスムーズスクロール＆強調。
* 2バイト上書き→200ms以内に該当サブツリーが更新。
* セッション保存→復元でビュー状態・注釈が再現。
* 解析失敗時、UIが落ちずにエラーノードを指し示す。

---

## 20. 付録：KSY最小例（再掲・微修正版）

```yaml
meta:
  id: my_container
  endian: be
seq:
  - id: header
    type: header
  - id: container
    type: container
    pos: header.container_ofs
types:
  header:
    seq:
      - id: magic
        type: str
        size: 4
        encoding: ASCII
      - id: header_len
        type: u4
      - id: container_ofs
        type: u4
      - id: reserved
        size: 8
  container:
    seq:
      - id: kind
        type: u4
      - id: data_len
        type: u4
      - id: data
        size: data_len
```
