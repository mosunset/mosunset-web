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

### 方法1: カメラでバーコードをスキャン

```bash
python main.py
```

1. メニューから「1: 本をスキャン」を選択
2. カメラが起動するので、本のバーコードをかざす
3. ISBNが検出されると自動的に本の情報を取得
4. AIがカテゴリとタグを決定
5. mdocファイルと画像が出力フォルダに保存される

ESCキーでカメラを終了できます。

### 方法2: 楽天Books APIを使用（rakutenフォルダのISBNファイルを処理）

```bash
python rakuten_processor.py
```

1. `rakuten`フォルダ内の全ての`.mdoc`ファイルからISBNを抽出
2. 各ISBNについて楽天Books APIで情報を取得
3. `itemCaption`を本文として使用
4. AIが`itemCaption`の要約を生成してdescriptionに設定
5. AIがカテゴリとタグを決定
6. mdocファイルと画像が出力フォルダに保存される

この方法では、Google Books APIではなく楽天Books APIを使用します。

## 仕様

カメラで本のバーコードを読み取ってISBNを取得し、そのISBNの本を検索して、表紙画像を取得して、mdocファイルを作成する。
バーコードのない本は諦めて手動登録する

### 出力

-output (フォルダ)
    - images (フォルダ)
        - books (フォルダ)
            - <ISBN> (フォルダ)
                - thumbnail.jpg (表紙画像)
    - content (フォルダ)
        - books (フォルダ)
            - <ISBN>.mdoc (Markdownファイル)
    - log.txt (テキストファイル)

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
  - これは`@assets/images/books/<ISBN>/thumbnail.webp`とする
  - astro 側で自動変換されるので 取得した画像がどんなものでも".webp"とする

自動で取れないもの:

- publishedDate
  - 日付が取れない場合もあるが、その場合は空欄しlog.txtに記録する
- description
  - 空欄で良い
- category
  - LMStudioのAIに聞いてカテゴリを決める
- tags
  - LMStudioのAIに聞いてタグを決める
  - 3つまで
