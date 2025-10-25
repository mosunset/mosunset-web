# 大量にある本をAstro Contentsに追加するスクリプト

## インストール

```bash
cd add_book
pip install -r requirements.txt
```

### 必要な環境

- Python 3.8以上
- Webカメラ
- LM Studio（ローカルで実行中）

### LM Studioの設定

1. LM Studioをインストールして起動
2. 適切なモデルをロード
3. サーバーを起動（デフォルト: <http://localhost:1234）>

環境変数で設定を変更できます：

```bash
export LM_STUDIO_BASE_URL="http://localhost:1234/v1"
export LM_STUDIO_MODEL="your-model-name"
```

## 使い方

### メインスクリプト実行

```bash
python main.py
```

メニューから以下を選択できます：

#### 1: 連続スキャンモード（カメラ起動のまま）

カメラを起動したまま、複数の本を連続でスキャンできるモードです。

1. カメラが起動し、起動したまま待機
2. 本のバーコードをカメラにかざす
3. ISBNが検出されると自動的に処理開始
4. 処理中は画面に「Processing...」と表示
5. 処理完了後、自動的に次のスキャン待ちに戻る
6. ESCキーでスキャンモードを終了

**メリット**: 大量の本を効率的に登録できる（カメラの起動時間を節約）

#### 2: 単発スキャンモード（1冊ずつ）

1冊ずつカメラを起動してスキャンするモードです。

1. メニューから「2: 単発スキャンモード」を選択
2. カメラが起動
3. 本のバーコードをかざす
4. ISBNが検出されると処理開始
5. 処理完了後、カメラが自動的に終了
6. メニューに戻る

#### 処理内容（共通）

1. Google Books APIと楽天Books APIの両方で情報を取得
2. 各項目について情報量が多い方を自動的に採用
3. 両方のAPIから表紙画像をダウンロードして最適なものを選択
4. AIが`itemCaption`または`description`の要約を生成
5. AIがカテゴリとタグを決定
6. mdocファイルと画像が出力フォルダに保存

**注意**: このスクリプトは両方のAPIから情報を取得して最も詳細な情報を使用します。

## 情報マージ方式

Google Books APIと楽天Books APIの両方から情報を取得し、以下のルールで最適な情報を選択します：

### マージルール

各項目（title、author、publisher、publishedDate、description、thumbnail_url）について：

- **情報量が多い方を採用**: 文字数が多い方のAPIの情報を使用
- **片方にしかない場合**: その情報を採用
- **両方にない場合**: 空欄

### 特別な処理

- **itemCaption**: 楽天APIのみが提供する詳細な説明文（本文として使用）
- **description**: itemCaptionまたはGoogle APIのdescriptionをAIで要約して生成
- **publishedDate**: AIで自動的にyyyy-mm-dd形式に変換
- **thumbnail**: 高度な画像選択機能（詳細は下記参照）

### サムネイル画像の選択機能

両方のAPIから最適な画像を自動的に選択します：

#### 自動選択の流れ

1. **楽天のURL事前チェック**
   - 楽天のURLに「noimage」が含まれている場合、Googleの画像のみをダウンロード
   - 例: `https://thumbnail.image.rakuten.co.jp/@0_mall/book/cabinet/noimage_01.gif`

2. **両方の画像をダウンロード**
   - GoogleのURL: クエリパラメータを保持（画像サイズ指定のため）
   - 楽天のURL: クエリパラメータを削除

3. **解像度を比較**
   - 両方の画像のピクセル数を計算
   - ログに詳細情報を出力

4. **プレースホルダー検出**
   - 楽天の画像が以下の条件を満たす場合、プレースホルダーと判定：
     - 縦横比が1:1に近い（0.9～1.1）
     - サイズが200×200ピクセル以下

5. **自動選択またはユーザー選択**
   - **プレースホルダー検出時**: ユーザーに選択肢を提示

     ```text
     1: Google画像 (128x193)
     2: 楽天画像 (200x200) ※プレースホルダーの可能性あり
     3: デフォルト画像 (unknown.png)
     ```

   - **通常時**: 解像度が高い方を自動選択

6. **フォールバック**
   - 両方の画像が取得できない場合: デフォルト画像（unknown.png）を使用

### メリット

- Google Books APIと楽天Books API両方の長所を活用
- より詳細で正確な書籍情報を取得
- 一方のAPIで情報が欠けていても他方で補完

## 仕様

カメラで本のバーコードを読み取ってISBNを取得し、そのISBNの本を検索して、表紙画像を取得して、mdocファイルを作成する。
バーコードのない本は諦めて手動登録する

### 出力

```text
output/ (フォルダ)
├── images/
│   └── books/
│       └── {ISBN}/
│           └── thumbnail.webp (表紙画像)
├── content/
│   └── books/
│       └── {ISBN}.mdoc (Markdownファイル)
└── log.txt (ログファイル)
```

#### mdocファイルの例

```markdown
---
draft: false
visibility: public
isbn: '9784295020325'
title: 徹底攻略Java SE 17 Silver問題集［1Z0-825］対応
author: 志賀 澄人
publisher: インプレス
publishedDate: 2024-10-16
description: Java資格対策書で人気の徹底攻略シリーズ
thumbnail: '@assets/images/books/9784295020325/thumbnail.webp'
category: 専門書
tags:
  - Java
format: 紙
status: 未読
evaluation: 未評価
---
```

変更しないもの:

- draft
- visibility
- format
- status
- evaluation

- thumbnail
  - これは`@assets/images/books/{ISBN}/thumbnail.webp`とする
  - astro 側で自動変換されるので 取得した画像がどんなものでも".webp"とする

AIで自動処理するもの:

- **publishedDate**
  - APIから取得した日付文字列をAIでyyyy-mm-dd形式に変換
  - 変換できない場合は1970-01-01をデフォルト値として使用
  - 警告をlog.txtに記録
- **description**
  - itemCaption（楽天）またはdescription（Google）をAIで2〜3行に要約
  - 両方ない場合は空欄
- **category**
  - タイトル、著者、説明をもとにAIがカテゴリを決定
  - 選択肢: 専門書、実用書、趣味、小説、ビジネス、文庫、コミック、その他
- **tags**
  - タイトル、著者、説明をもとにAIが適切なタグを3つまで提案
  - 例: プログラミング, Python, 初心者向け

## 技術仕様

- **画像形式**: 取得した画像は全てWebP形式で保存（quality=90）
- **バーコード検出**: EAN13形式で978から始まるISBN-13を検出
- **カメラデバイス**: `cv2.VideoCapture(1)` を使用（外部カメラ）
- **同じISBN防止**: 連続スキャンモードでは同じISBNを連続で読み取らない
- **エラーハンドリング**: 全てのエラーをlog.txtに記録

## プロジェクト構造

```text
add_book/
├── main.py                 # メインエントリーポイント
├── config.py               # グローバル設定
│
├── core/                   # コアビジネスロジック
│   ├── __init__.py
│   └── book_processor.py   # 本の処理フロー全体を統括
│
├── clients/                # 外部APIクライアント
│   ├── __init__.py
│   ├── google_api.py       # Google Books API通信
│   ├── rakuten_api.py      # 楽天Books API通信
│   └── api_merger.py       # 複数API情報の統合ロジック
│
├── scanners/               # 入力デバイス処理
│   ├── __init__.py
│   └── barcode_scanner.py  # カメラ・バーコード読取
│
├── processors/             # データ処理・加工
│   ├── __init__.py
│   ├── ai_processor.py     # LM StudioによるAI処理
│   └── image_processor.py  # 画像DL・変換・選択
│
├── generators/             # ファイル生成
│   ├── __init__.py
│   └── mdoc_generator.py   # mdocファイル作成
│
├── utils/                  # 共通ユーティリティ
│   ├── __init__.py
│   ├── logger.py           # ログ出力
│   ├── file_system.py      # ディレクトリ操作
│   └── helpers.py          # 汎用ヘルパー
│
├── output/                 # 出力先
│   ├── images/books/       # 表紙画像（WebP）
│   ├── content/books/      # mdocファイル
│   └── log.txt            # 実行ログ
│
├── unknown.png            # 画像取得失敗時の代替
├── requirements.txt       # Python依存パッケージ
└── README.md             # このドキュメント
```

### モジュール詳細

#### 📦 core/ - コアビジネスロジック

- **book_processor.py**: 本の登録処理全体を統括
  - clients, processors, generatorsを組み合わせて処理フローを実現
  - ISBNから完成したmdocファイルまでの一連の流れを管理

#### 🌐 clients/ - 外部APIクライアント

- **google_api.py**: Google Books API
  - ISBNから書籍情報を検索
  - タイトル、著者、出版社、説明文、サムネイルURLを取得

- **rakuten_api.py**: 楽天Books API
  - ISBNから書籍情報を検索
  - itemCaption（詳細説明）を含む情報を取得

- **api_merger.py**: 情報統合ロジック
  - 2つのAPIから取得した情報を比較
  - より情報量の多い方を自動選択

#### 📸 scanners/ - 入力デバイス処理

- **barcode_scanner.py**: バーコードスキャン
  - OpenCV + pyzbarでバーコード認識
  - 連続スキャンモード・単発モードの実装
  - EAN13形式のISBN-13に対応

#### ⚙️ processors/ - データ処理・加工

- **ai_processor.py**: AI処理（LM Studio）
  - 日付文字列のyyyy-mm-dd形式への変換
  - descriptionの要約生成（2-3行）
  - カテゴリとタグの自動決定

- **image_processor.py**: 画像処理
  - 複数URLから画像ダウンロード
  - 解像度比較・最適画像選択
  - プレースホルダー検出
  - WebP形式への変換（quality=90）

#### 📝 generators/ - ファイル生成

- **mdoc_generator.py**: mdocファイル作成
  - Astro用のmdocフォーマット出力
  - YAML frontmatterの生成
  - 本文（itemCaption）の埋め込み

#### 🛠️ utils/ - 共通ユーティリティ

- **logger.py**: ログ機能
  - タイムスタンプ付きログ出力
  - コンソールとファイルの両方に記録

- **file_system.py**: ディレクトリ操作
  - 出力ディレクトリの自動作成

- **helpers.py**: 汎用ヘルパー
  - テキスト長計算など

## アーキテクチャ

### 処理フロー

```text
1. ユーザー入力 (scanners)
   ↓ ISBN
2. API情報取得 (clients)
   ↓ 書籍情報
3. AI処理 (processors/ai_processor)
   ↓ カテゴリ・タグ・要約
4. 画像処理 (processors/image_processor)
   ↓ 最適な表紙画像
5. ファイル生成 (generators)
   ↓ mdocファイル
6. 出力 (output/)
```

### 依存関係の原則

- **単一責任の原則**: 各モジュールは1つの責任のみを持つ
- **依存性逆転の原則**: 上位モジュールは下位モジュールに依存
- **インターフェース分離**: 必要な機能のみを公開

```text
main.py
  ↓
core/book_processor.py
  ├→ clients/
  ├→ processors/
  ├→ generators/
  └→ utils/
```

## 開発ガイド

### 新しいAPIクライアントの追加

1. `clients/`に新しいファイルを作成（例: `openbd_api.py`）
2. `clients/__init__.py`にエクスポートを追加
3. `clients/api_merger.py`でマージロジックを拡張

### 新しいプロセッサーの追加

1. `processors/`に新しいファイルを作成
2. `processors/__init__.py`にエクスポートを追加
3. `core/book_processor.py`で処理フローに組み込む

### 新しいスキャン方法の追加

1. `scanners/`に新しいファイルを作成
2. `scanners/__init__.py`にエクスポートを追加
3. `main.py`のメニューに選択肢を追加

## トラブルシューティング

### カメラが起動しない

```python
# config.pyまたはコード内でカメラデバイスIDを変更
cap = cv2.VideoCapture(0)  # 0: 内蔵カメラ, 1: 外部カメラ
```

### LM Studioに接続できない

1. LM Studioが起動しているか確認
2. サーバーが開始されているか確認
3. ポート番号（デフォルト: 1234）を確認
4. 環境変数で設定を変更：

```bash
export LM_STUDIO_BASE_URL="http://localhost:1234/v1"
```

### APIレート制限

- Google Books API: 1日1000リクエストまで
- 楽天Books API: アプリケーションIDごとに制限あり
- 連続スキャン時は注意が必要

### 画像が取得できない

1. インターネット接続を確認
2. APIから返されるURLが有効か確認
3. `unknown.png`がプロジェクトルートにあるか確認

## ライセンス

このプロジェクトは個人利用を目的としています。
外部APIの利用規約を遵守してください。

## 貢献

バグ報告や機能提案は歓迎します。

## 注意事項

- このツールは書籍情報の自動収集を目的としています
- API利用規約を遵守してください
- 取得した情報の著作権に注意してください
- 商用利用前に各APIの利用規約を確認してください
