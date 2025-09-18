# Kaitai Struct KSY 記述ガイド（実践＋網羅版）

> **対象**: Kaitai Struct を使って独自バイナリをパースしたい人（KSY を書く人）  
> **本書の構成**: KSY の抽象的説明 → YAML 基礎 → KSY の主要キー＆記法 → 実践パターン集 → ベストプラクティス／落とし穴 → 公式リンク集

---

## 0. Kaitai Struct / KSY とは（抽象的説明）

**Kaitai Struct** は、バイナリフォーマットを**宣言的**に記述する DSL（ドメイン固有言語）です。  
拡張子 **`.ksy`** の YAML ファイルでフォーマットを定義し、**コンパイラ**（`kaitai-struct-compiler`）で各言語の**パーサコード**に変換して利用します。Web IDE で手元のバイナリに対して**可視化**・**検証**することもできます。

- 何が嬉しい？  
  - 「どの順序で何バイト読むか」を**宣言**するだけで、繰り返し・条件分岐・オフセット参照・サブストリームなど**現実的な表現力**をカバー。  
  - 一度 KSY を書けば、**複数言語**にパーサを生成可能（C++/STL, C#, Go, Java, JavaScript, Lua, Nim, Perl, PHP, Python, Ruby など）。
  - Web IDE で**hex と構造の対応**を直感的に確認でき、リバースエンジニアリングを強力に支援。

---

## 1. YAML の基本（KSY で使う範囲）

KSY は **YAML** で書きます。YAML は**インデント**と**コロン**で辞書（マップ）を、`-` で配列（シーケンス）を表します。

### 1.1 最低限の文法
- **インデントはスペース**（タブ不可）。KSY では **2 スペース推奨**。
- マップ（辞書）:  
  ```yaml
  meta:
    id: my_format
    endian: le
  ```
- シーケンス（配列）:  
  ```yaml
  imports:
    - date
    - other/types
  ```
- 文字列:
  - シングルクォート `'...'` は**エスケープなし**のリテラル。
  - ダブルクォート `"..."..."` は**エスケープ可**（改行・16進など）。
  - 複数行は **リテラルブロック**（`|`）が読みやすい。
- アンカー・エイリアス（`&name`, `*name`）も YAML 機能として使えるが、KSY 初学では多用しないのが無難。

> スタイルは公式の **KSY Style Guide** を参考に。フィールド順や命名規則（`lower_underscore_case`）、`doc` の書き方などがまとまっています。

---

## 2. KSY の基本構造（トップレベル）

KSY ファイルは概ね次のトップレベルキーで構成されます：

```yaml
meta:        # メタ情報（id, endian, imports, tags など）
doc:         # （任意）全体の説明
doc-ref:     # （任意）参考URL等
seq:         # 順次に読むフィールド配列（主役）
instances:   # 遅延評価フィールド（pos/io/size 指定など）
types:       # サブタイプ（再利用・ネスト構造）
enums:       # 列挙型（数値→名前）
```

### 2.1 `meta`（メタ情報）
- 代表的キー:
  - `id`: フォーマット名（**ファイル名と一致**が望ましい）
  - `endian`: 既定エンディアン。`be` / `le` / さらに**計算式で可変**（後述）
  - `encoding`: 既定文字コード（`type: str` に適用）
  - `imports`: 他の `.ksy` を取り込む
  - `ks-version`: 必要な ksc 最低バージョン
  - `tags`, `file-extension`, `license`, `xref` などドキュメンテーション用途

### 2.2 `seq`（逐次読み）
各要素は「**フィールド**」です。主なキー：

| キー | 役割 | 例 |
|---|---|---|
| `id` | フィールド名 | `id: header_len` |
| `type` | 型 | `u4`, `s8`, `f8`, `str`, **サブタイプ名** など |
| `size` | バイト数 | `size: 20`, `size: header_len * 2` |
| `size-eos` | ストリーム終端まで | `size-eos: true` |
| `contents` | 固定バイト列（マジック） | `contents: [0x89, 0x50, 0x4E, 0x47]` |
| `enum` | 列挙型の適用 | `enum: opcode` |
| `encoding` | 文字コード | `encoding: UTF-8` |
| `if` | 条件読み | `if: flags.has_meta` |
| `repeat` | 繰り返し | `eos` / `expr` / `until` |
| `repeat-expr` | 回数 | `repeat-expr: num_entries` |
| `repeat-until` | 終了条件 | `repeat-until: _.len == 0` |
| `terminator` | デリミタ（可変長） | `terminator: 0` |
| `include` | 終端バイトを**含める** | `include: true` |
| `consume` | 終端バイトを**消費** | `consume: false`（次要素に残す） |
| `eos-error` | デリミタ欠如時の扱い | `eos-error: false` |
| `process` | 事前処理 | `process: xor(0xaa)` / **カスタム** |
| `pad-right` | 右パディング除去 | `pad-right: 0` |

> `type` を省略すると「生バイト配列」扱い。**必ず** `size` / `size-eos` / `terminator` のいずれかで長さを決めます。

### 2.3 型リテラルの例
- 符号付/なし整数: `s1/s2/s4/s8`, `u1/u2/u4/u8`（`be`/`le` サフィックスで強制可）  
  例: `u4le`, `s8be`
- 浮動小数: `f4`, `f8`（同様にエンディアン強制可）
- 文字列: `str`（要 `encoding`）、`strz`（暗黙に `terminator: 0`）
- ビット長整数: `b1`, `b3`, `b9` など（`meta.bit-endian` を設定）

### 2.4 `instances`（遅延評価・オフセット参照）
`seq` と同じ書き方で**ランダムアクセス**的に読む要素。

- `pos`: 読み出し開始位置（**バイト**／式可）
- `io`: どのストリームから読むか（例: `_root._io` で**絶対**位置）
- `size`: 読み幅（サブストリームの**上限**に）

> `instances` は **lazy**（最初にアクセスされた時に読み込み）。巨大ファイルでも初期負荷が低い。

### 2.5 `types`（サブタイプ）と `params`（パラメータ化）
- `types:` 配下に**再利用可能な型**を定義し、`type: foo_bar` のように参照。
- 型に `params:` を定義すると **型の呼び出し時に引数**を渡せる：
  ```yaml
  types:
    kv_pair:
      params:
        - id: key_len
          type: u2
      seq:
        - id: key
          size: key_len
          type: str
        - id: value
          type: strz

  seq:
    - id: entries
      type: kv_pair(8)
      repeat: expr
      repeat-expr: 10
  ```

### 2.6 `enums`（列挙）
数値に**意味ある名前**を割り当てます（FourCC などにも有効）。

```yaml
enums:
  media:
    0x01: cdrom
    0x02: dvdrom
    0x03: cassette
```

### 2.7 `switch-on`（型スイッチ）
TLV など**タグにより中身の型が変わる**場合：
```yaml
- id: body
  size: len
  type:
    switch-on: rec_type
    cases:
      1: type_a
      2: type_b
      _: type_unknown  # デフォルト
```

---

## 3. 実践パターン集（よく使う構図）

### 3.1 マジック＋ヘッダ＋可変長ボディ
```yaml
meta:
  id: sample_container
  endian: le

seq:
  - id: magic
    contents: [0x53, 0x43, 0x54, 0x01]  # "SCT\x01"
  - id: header_len
    type: u4
  - id: header
    size: header_len
  - id: body_len
    type: u4
  - id: body
    size: body_len
```

### 3.2 文字列（デリミタ制御）
```yaml
- id: title
  type: str
  terminator: 0x0a     # 改行終端
  include: false       # 終端を値に含めない（既定）
  consume: true        # 終端を消費（既定）
  eos-error: true      # 終端が無ければエラー（既定）
  encoding: UTF-8
```

### 3.3 繰り返し（3種類）
```yaml
# 末尾まで繰り返す
- id: records
  type: rec
  repeat: eos

# 個数で繰り返す
- id: count
  type: u4
- id: items
  type: item
  repeat: expr
  repeat-expr: count

# 条件成立まで繰り返す（_ は直近要素）
- id: nums
  type: s4
  repeat: until
  repeat-until: _ == -1
```

### 3.4 TLV（switch-on）＋未対応タイプの安全処理
```yaml
- id: rec_type
  type: u1
- id: len
  type: u4
- id: body
  size: len
  type:
    switch-on: rec_type
    cases:
      1: rec_type_a
      2: rec_type_b
      _: rec_unknown  # 未対応でも size があるので安全に読み飛ばせる
```

### 3.5 サブストリームとオフセット参照（pos/io）
```yaml
seq:
  - id: header
    size: 32
  - id: files
    type: file_entry
    size: 80
    repeat: eos

types:
  file_entry:
    seq:
      - id: name
        type: strz
      - id: ofs_body
        type: u4
      - id: len_body
        type: u4
    instances:
      body:
        io: _root._io   # ルートのストリームを明示（絶対位置）
        pos: ofs_body
        size: len_body
```

### 3.6 エンディアンをマジックで切替（計算済み既定値）
```yaml
types:
  tiff_body:
    meta:
      endian:
        switch-on: _root.indicator
        cases:
          '[0x49, 0x49]': le   # "II"
          '[0x4d, 0x4d]': be   # "MM"
```

### 3.7 バイト処理（process）
```yaml
- id: payload
  size: payload_len
  process: xor(0xaa)                 # 既定の XOR 処理
  # process: my_custom_processor(key) # カスタム処理（各言語で実装）
```

### 3.8 値インスタンス（計算フィールド）
```yaml
instances:
  len_meters:
    value: len_feet * 0.3048
```

### 3.9 ビットフィールド
```yaml
meta:
  bit-endian: be
seq:
  - id: version
    type: b4
  - id: header_len
    type: b4
```

### 3.10 反復インデックス（`_index`）の利用
```yaml
seq:
  - id: sizes
    type: u4
    repeat: expr
    repeat-expr: num_files
  - id: files
    type: file
    size: sizes[_index]  # 直近の反復インデックス
    repeat: expr
    repeat-expr: num_files
```

---

## 4. 式言語（Expression Language）の要点

- **演算**: 算術・比較・論理・ビット演算など一般的な演算が可。
- **リテラル**: 10進/16進（`0x`）/2進（`0b`）・文字列・配列。
- **特別な参照**:
  - `_root` … 最上位型のインスタンス
  - `_parent` … 親のインスタンス（入れ子で変化）
  - `_io` … 現在のストリーム
  - `_index` … 反復中のインデックス（0 始まり）
  - `_` … `repeat-until` 内で**直近に読んだ要素**
- **型キャスト**やメソッド群も利用可（例: 文字列操作、配列長など）。

---

## 5. ベストプラクティス（Style Guide 抜粋）

- **2 スペース**インデント、UTF-8、LF 改行、末尾改行。
- セクション順序（推奨）: `meta` → `doc` → `doc-ref` → `seq` → `instances/types/enums`。  
- `id` は `lower_underscore_case`。数・オフセット・長さは `num_*/ofs_*/len_*` 命名。  
- `types`/`instances` のキー順も**決められた順序**で統一（可読性向上）。
- Windows/Linux の既存 `struct` を**そのまま写経しない**。KSY に最適化された命名・構造にする。

---

## 6. よくある落とし穴（Common pitfalls）

- **`size` を指定するとサブストリーム化**される：相対 `pos` の基準も変わる。  
  - サブストリーム外を参照したい場合は `io: _root._io` を明示。
- **配列と要素のキーのスコープ**: `size` は「要素のサイズ」。配列全体に対するサイズ制約は**ラッパー型**を作ってそこに付ける。
- **`process` はサイズが必要**：長さ未指定の生バイトには適用できない。
- **FourCC は `str` マッチより `u4` + `enum` が高速で堅牢**。
- **`terminator/include/consume/eos-error`** の組み合わせで**可変長**を堅牢に。

---

## 7. 最小テンプレート

```yaml
meta:
  id: your_format
  endian: le

doc: |
  Short description of your format.

seq:
  - id: magic
    contents: [0x00, 0x01]
  - id: header_len
    type: u4
  - id: header
    size: header_len
  - id: recs
    type: rec
    repeat: eos

types:
  rec:
    seq:
      - id: kind
        type: u1
      - id: len
        type: u4
      - id: body
        size: len
        type:
          switch-on: kind
          cases:
            1: rec_a
            2: rec_b
            _: rec_unknown
    types:
      rec_a:
        seq:
          - id: name
            type: strz
            encoding: UTF-8
      rec_b:
        seq:
          - id: value
            type: u4
```

---

## 8. 公式リンク集（ブックマーク推奨）

- **公式サイト**: <https://kaitai.io/>  
- **ドキュメントポータル**: <https://doc.kaitai.io/>  
  - **User Guide**（実用解説）: <https://doc.kaitai.io/user_guide.html>  
  - **KSY Syntax Diagram**（言語リファレンス）: <https://doc.kaitai.io/ksy_diagram.html>  
  - **KSY Style Guide**（スタイル規約）: <https://doc.kaitai.io/ksy_style_guide.html>  
  - **Serialization Guide**（実験的/高度）: <https://doc.kaitai.io/serialization.html>
- **Format Gallery**（既存フォーマット集）: <https://formats.kaitai.io/>  
- **Web IDE**（ブラウザで編集・可視化）: <https://ide.kaitai.io/>  
- **Compiler**（ksc）: <https://github.com/kaitai-io/kaitai_struct_compiler>  
- **KSY ライブラリ**: <https://github.com/kaitai-io/kaitai_struct_formats>  

---

## 9. チェックリスト（公開前の最終確認）

- [ ] `meta.id` はファイル名と一致しているか  
- [ ] 既定 `endian` / `bit-endian` は妥当か（必要なら switch で切替）  
- [ ] マジック（`contents`）で**型誤入力**を弾いているか  
- [ ] 可変長は `size` / `size-eos` / `terminator` が正しく指定されているか  
- [ ] `repeat` の 3 形（`eos` / `expr` / `until`）のどれかで妥当な停止条件になっているか  
- [ ] `pos` / `io` を使う箇所は**相対/絶対**を取り違えていないか  
- [ ] `process` の対象に**サイズ**が与えられているか  
- [ ] `types` の再利用・`params` の引き回しで重複を減らせているか  
- [ ] `doc` の充実（概要／単項目）と Style Guide の体裁を満たしているか  

---

### Appendix A. より高度な話題（必要に応じて）

- **計算既定エンディアン**（`meta.endian: switch-on`）  
- **`value` インスタンス**（派生値・ユーティリティ計算を名前付きで）  
- **`imports`**（共通型の切り出し／再利用）  
- **Opaque Types**（外部実装と連携）  
- **Custom Processors**（独自の復号／伸長アルゴリズムを組み込む）  
- **Repetition index（`_index`）** の活用パターン集  

---

**Happy parsing!** 逆アセンブルと違って、「読める」フォーマットを育てられるのが KSY の醍醐味です。
