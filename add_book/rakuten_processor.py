"""rakutenフォルダのISBNファイルから楽天Books APIで情報を取得し、Astro Contentsに追加するスクリプト"""

from datetime import datetime
from io import BytesIO
from pathlib import Path

import requests
from config import (
    BOOK_CATEGORIES,
    CONTENT_DIR,
    DEFAULT_MDOC_VALUES,
    IMAGES_DIR,
    LM_STUDIO_BASE_URL,
    LM_STUDIO_MODEL,
    LOG_FILE,
    OUTPUT_DIR,
)
from PIL import Image

# 楽天Books API設定
RAKUTEN_APP_ID = "1087564174317084187"
RAKUTEN_API_URL = "https://app.rakuten.co.jp/services/api/BooksBook/Search/20170404"


def setup_directories():
    """出力ディレクトリを作成"""
    OUTPUT_DIR.mkdir(exist_ok=True)
    IMAGES_DIR.mkdir(parents=True, exist_ok=True)
    CONTENT_DIR.mkdir(parents=True, exist_ok=True)


def log_message(message: str):
    """ログファイルとコンソールにメッセージを出力"""
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    log_entry = f"[{timestamp}] {message}\n"
    print(log_entry.strip())
    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write(log_entry)


def get_isbns_from_rakuten_folder():
    """rakutenフォルダから全てのISBNを取得"""
    rakuten_dir = Path(__file__).parent / "rakuten"
    isbn_list = []

    if not rakuten_dir.exists():
        log_message(f"エラー: rakutenフォルダが見つかりません: {rakuten_dir}")
        return isbn_list

    for mdoc_file in rakuten_dir.glob("*.mdoc"):
        isbn = mdoc_file.stem
        isbn_list.append(isbn)

    log_message(f"{len(isbn_list)}件のISBNファイルを発見しました")
    return isbn_list


def search_book_by_rakuten_api(isbn: str):
    """楽天Books APIでISBNから本を検索"""
    log_message(f"楽天Books APIで本を検索中: {isbn}")

    try:
        params = {"format": "json", "isbn": isbn, "applicationId": RAKUTEN_APP_ID}
        response = requests.get(RAKUTEN_API_URL, params=params, timeout=10)
        response.raise_for_status()

        data = response.json()

        if data.get("count", 0) == 0:
            log_message(f"警告: ISBNに該当する本が見つかりませんでした: {isbn}")
            return None

        item_info = data["Items"][0]["Item"]

        # 出版日の取得と整形（AIに変換を依頼）
        sales_date = item_info.get("salesDate", "")
        published_date = convert_date_with_ai(sales_date, isbn)

        # itemCaptionを本文として使用
        item_caption = item_info.get("itemCaption", "")

        book_info = {
            "isbn": isbn,
            "title": item_info.get("title", "タイトル不明"),
            "author": item_info.get("author", "不明"),
            "publisher": item_info.get("publisherName", "不明"),
            "publishedDate": published_date,
            "itemCaption": item_caption,
            "thumbnail_url": item_info.get("largeImageUrl", ""),
        }

        log_message(f"本の情報を取得しました: {book_info['title']}")
        return book_info

    except requests.exceptions.RequestException as e:
        log_message(f"エラー: 本の検索に失敗しました - {e}")
        return None


def download_thumbnail(thumbnail_url: str, isbn: str):
    """表紙画像をダウンロードしてwebp形式で保存"""
    # 保存先ディレクトリを作成
    isbn_dir = IMAGES_DIR / isbn
    isbn_dir.mkdir(exist_ok=True)
    output_path = isbn_dir / "thumbnail.webp"

    if not thumbnail_url:
        log_message(f"警告: サムネイル画像のURLがありません - ISBN: {isbn}")
        # unknown.pngをコピー
        unknown_path = Path(__file__).parent / "unknown.png"
        if unknown_path.exists():
            try:
                # unknown.pngを開いてwebp形式で保存
                img = Image.open(unknown_path)
                # RGBAモードの場合はRGBに変換
                if img.mode in ("RGBA", "LA", "P"):
                    background = Image.new("RGB", img.size, (255, 255, 255))
                    if img.mode == "P":
                        img = img.convert("RGBA")
                    background.paste(
                        img,
                        mask=img.split()[-1] if img.mode in ("RGBA", "LA") else None,
                    )
                    img = background
                img.save(output_path, "WEBP", quality=90)
                log_message(
                    f"デフォルト画像(unknown.png)をwebp形式で保存しました: {output_path}"
                )
                return True
            except Exception as e:
                log_message(f"エラー: デフォルト画像のコピーに失敗しました - {e}")
                return False
        else:
            log_message("エラー: unknown.pngが見つかりません")
            return False

    log_message(f"表紙画像をダウンロード中: {thumbnail_url}")

    try:
        # 画像をダウンロード
        response = requests.get(thumbnail_url, timeout=10)
        response.raise_for_status()

        # 画像を開く
        img = Image.open(BytesIO(response.content))

        # RGBAモードの場合はRGBに変換
        if img.mode in ("RGBA", "LA", "P"):
            background = Image.new("RGB", img.size, (255, 255, 255))
            if img.mode == "P":
                img = img.convert("RGBA")
            background.paste(
                img, mask=img.split()[-1] if img.mode in ("RGBA", "LA") else None
            )
            img = background

        # webp形式で保存
        img.save(output_path, "WEBP", quality=90)

        log_message(f"表紙画像をwebp形式で保存しました: {output_path}")
        return True

    except Exception as e:
        log_message(f"エラー: 表紙画像のダウンロードに失敗しました - {e}")
        # ダウンロードに失敗した場合もunknown.pngを使用
        unknown_path = Path(__file__).parent / "unknown.png"
        if unknown_path.exists():
            try:
                img = Image.open(unknown_path)
                # RGBAモードの場合はRGBに変換
                if img.mode in ("RGBA", "LA", "P"):
                    background = Image.new("RGB", img.size, (255, 255, 255))
                    if img.mode == "P":
                        img = img.convert("RGBA")
                    background.paste(
                        img,
                        mask=img.split()[-1] if img.mode in ("RGBA", "LA") else None,
                    )
                    img = background
                img.save(output_path, "WEBP", quality=90)
                log_message(
                    f"ダウンロード失敗のため、デフォルト画像(unknown.png)をwebp形式で保存しました: {output_path}"
                )
                return True
            except Exception as e2:
                log_message(f"エラー: デフォルト画像のコピーにも失敗しました - {e2}")
                return False
        return False


def ask_lm_studio(prompt: str):
    """LM StudioのAPIに質問"""
    try:
        headers = {"Content-Type": "application/json"}
        data = {
            "model": LM_STUDIO_MODEL,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.7,
            "max_tokens": 200,
        }

        response = requests.post(
            f"{LM_STUDIO_BASE_URL}/chat/completions",
            headers=headers,
            json=data,
            timeout=30,
        )
        response.raise_for_status()

        result = response.json()
        return result["choices"][0]["message"]["content"].strip()

    except Exception as e:
        log_message(f"警告: LM Studioへの問い合わせに失敗しました - {e}")
        return None


def convert_date_with_ai(date_string: str, isbn: str):
    """AIを使って日付文字列をyyyy-mm-dd形式に変換"""
    if not date_string:
        log_message(
            f"警告: 出版日が取得できませんでした - ISBN: {isbn} (デフォルト: 1970-01-01)"
        )
        return "1970-01-01"

    log_message(f"AIに日付変換を問い合わせ中: {date_string}")

    date_prompt = f"""
以下の日付文字列をyyyy-mm-dd形式（例: 2025-03-19）に変換してください。

日付文字列: {date_string}

回答は日付のみを答えてください（例: 2025-03-19）。余計な説明は不要です。
変換できない場合は「1970-01-01」を返してください。
"""

    converted_date = ask_lm_studio(date_prompt)

    if converted_date:
        converted_date = converted_date.strip()
        # 簡易的な形式チェック（yyyy-mm-dd形式かどうか）
        if (
            len(converted_date) == 10
            and converted_date[4] == "-"
            and converted_date[7] == "-"
        ):
            log_message(f"日付を変換しました: {date_string} -> {converted_date}")
            return converted_date
        else:
            log_message(
                f"警告: 日付変換に失敗しました ({date_string}) - ISBN: {isbn} (デフォルト: 1970-01-01)"
            )
            return "1970-01-01"
    else:
        log_message(
            f"警告: AI応答なし ({date_string}) - ISBN: {isbn} (デフォルト: 1970-01-01)"
        )
        return "1970-01-01"


def generate_description_summary(item_caption: str):
    """itemCaptionの要約をAIで生成"""
    if not item_caption:
        return ""

    log_message("AIにdescription要約を問い合わせ中...")

    summary_prompt = f"""
以下の本の説明文を3〜4行程度に要約してください。重要なポイントを簡潔にまとめてください。

説明文:
{item_caption}

要約のみを回答してください。余計な説明や前置きは不要です。
"""

    summary = ask_lm_studio(summary_prompt)

    if summary:
        log_message("要約を生成しました")
        return summary
    else:
        log_message("警告: 要約の生成に失敗しました")
        return ""


def determine_category_and_tags(book_info: dict):
    """LM Studioを使ってカテゴリとタグを決定"""
    title = book_info["title"]
    author = book_info["author"]
    item_caption = book_info.get("itemCaption", "")

    log_message("AIにカテゴリとタグを問い合わせ中...")

    # カテゴリを決定
    category_options = "\n".join(
        [f"- {value}: {label}" for value, label in BOOK_CATEGORIES.items()]
    )

    category_prompt = f"""
以下の本のカテゴリを決定してください。カテゴリは以下から1つだけ選んでください：

{category_options}

本の情報：
タイトル: {title}
著者: {author}
説明: {item_caption[:300]}

回答は選択肢の値（例: 専門書、文庫、コミックなど）のみを答えてください。余計な説明は不要です。
"""

    category = ask_lm_studio(category_prompt)

    # カテゴリが取得できない、または不正な値の場合はデフォルトを使用
    if category:
        category = category.strip()

    if not category or category not in BOOK_CATEGORIES.keys():
        log_message("警告: カテゴリの取得に失敗しました。デフォルト値を使用します")
        category = "その他"
    else:
        log_message(f"カテゴリ: {category} ({BOOK_CATEGORIES[category]})")

    # タグを決定
    tags_prompt = f"""
以下の本に適切なタグを3つ以内で提案してください。

本の情報：
タイトル: {title}
著者: {author}
説明: {item_caption[:300]}

回答はタグをカンマ区切りで3つ以内で答えてください（例: プログラミング, Python, 初心者向け）。余計な説明は不要です。
"""

    tags_response = ask_lm_studio(tags_prompt)

    if tags_response:
        # タグを分割して整形
        tags = [tag.strip() for tag in tags_response.split(",")]
        tags = [tag for tag in tags if tag][:3]  # 最大3つまで
        log_message(f"タグ: {', '.join(tags)}")
    else:
        log_message("警告: タグの取得に失敗しました")
        tags = []

    return category, tags


def create_mdoc_file(book_info: dict, category: str, tags: list, description: str):
    """mdocファイルを作成"""
    isbn = book_info["isbn"]
    log_message(f"mdocファイルを作成中: {isbn}")

    # タグのYAML配列形式を作成
    tags_yaml = ""
    if tags:
        tags_yaml = "tags:\n" + "\n".join([f"  - {tag}" for tag in tags])

    # publishedDateの処理
    published_date = book_info.get("publishedDate", "1970-01-01")
    published_date_yaml = f"publishedDate: {published_date}"

    # descriptionの処理
    description_yaml = f"description: {description}" if description else ""

    # itemCaptionを本文として追加
    item_caption = book_info.get("itemCaption", "")

    # mdocファイルの内容を作成
    mdoc_content = f"""---
draft: {str(DEFAULT_MDOC_VALUES["draft"]).lower()}
visibility: {DEFAULT_MDOC_VALUES["visibility"]}
isbn: '{isbn}'
title: {book_info["title"]}
author: {book_info["author"]}
publisher: {book_info["publisher"]}
{published_date_yaml}
{description_yaml}
thumbnail: '@assets/images/books/{isbn}/thumbnail.webp'
category: {category}
{tags_yaml}
format: {DEFAULT_MDOC_VALUES["format"]}
status: {DEFAULT_MDOC_VALUES["status"]}
evaluation: {DEFAULT_MDOC_VALUES["evaluation"]}
---
{item_caption}
"""

    # 空行を整理（連続する空行を1つにまとめる）
    lines = mdoc_content.split("\n")
    cleaned_lines = []
    prev_empty = False
    for line in lines:
        is_empty = line.strip() == ""
        if is_empty and prev_empty:
            continue  # 連続する空行をスキップ
        cleaned_lines.append(line)
        prev_empty = is_empty
    mdoc_content = "\n".join(cleaned_lines)

    # mdocファイルを保存
    mdoc_path = CONTENT_DIR / f"{isbn}.mdoc"
    with open(mdoc_path, "w", encoding="utf-8") as f:
        f.write(mdoc_content)

    log_message(f"mdocファイルを作成しました: {mdoc_path}")
    return mdoc_path


def process_book_from_isbn(isbn: str):
    """ISBNから本を処理"""
    log_message(f"=== 処理開始: ISBN {isbn} ===")

    # 楽天APIで本の情報を検索
    book_info = search_book_by_rakuten_api(isbn)
    if not book_info:
        log_message(f"本の情報の取得に失敗しました: {isbn}")
        return False

    # 表紙画像をダウンロード
    # クエリパラメータを除去してからダウンロード
    from urllib.parse import urlparse, urlunparse

    thumbnail_url = book_info["thumbnail_url"]
    if thumbnail_url:
        parsed = urlparse(thumbnail_url)
        # Remove query and fragment
        clean_url = urlunparse(parsed._replace(query="", fragment=""))
    else:
        clean_url = thumbnail_url

    download_thumbnail(clean_url, isbn)

    # itemCaptionの要約を生成
    description = generate_description_summary(book_info.get("itemCaption", ""))

    # カテゴリとタグを決定
    category, tags = determine_category_and_tags(book_info)

    # mdocファイルを作成
    create_mdoc_file(book_info, category, tags, description)

    log_message(f"本の登録が完了しました: {book_info['title']}")
    log_message(f"=== 処理完了: ISBN {isbn} ===\n")
    return True


def main():
    """メイン処理"""
    print("=" * 60)
    print("楽天Books API 本情報取得スクリプト")
    print("=" * 60)

    # ディレクトリをセットアップ
    setup_directories()

    log_message("スクリプトを開始しました")

    # rakutenフォルダからISBNを取得
    isbn_list = get_isbns_from_rakuten_folder()

    if not isbn_list:
        log_message("処理するISBNファイルがありません")
        return

    # 各ISBNを処理
    success_count = 0
    fail_count = 0

    for idx, isbn in enumerate(isbn_list, 1):
        log_message(f"進捗: {idx}/{len(isbn_list)}")
        if process_book_from_isbn(isbn):
            success_count += 1
        else:
            fail_count += 1

    # 結果をまとめて表示
    log_message("=" * 60)
    log_message("処理が完了しました")
    log_message(f"成功: {success_count}件 / 失敗: {fail_count}件")
    log_message(f"出力先: {OUTPUT_DIR}")
    log_message("=" * 60)


if __name__ == "__main__":
    main()
