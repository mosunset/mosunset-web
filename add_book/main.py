"""本のバーコードからISBNを取得し、Astro Contentsに追加するスクリプト"""

from datetime import datetime
from io import BytesIO

import cv2
import requests
from config import (
    BOOK_CATEGORIES,
    CONTENT_DIR,
    DEFAULT_MDOC_VALUES,
    GOOGLE_BOOKS_API_URL,
    IMAGES_DIR,
    LM_STUDIO_BASE_URL,
    LM_STUDIO_MODEL,
    LOG_FILE,
    OUTPUT_DIR,
)
from PIL import Image
from pyzbar.pyzbar import decode


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


def read_barcode_from_camera():
    """カメラからバーコードを読み取る"""
    log_message("カメラを起動しています...")
    cap = cv2.VideoCapture(1)

    if not cap.isOpened():
        log_message("エラー: カメラを開けませんでした")
        return None

    log_message("バーコードをカメラにかざしてください (ESCキーで終了)")

    while True:
        ret, frame = cap.read()
        if not ret:
            log_message("エラー: フレームの取得に失敗しました")
            break

        # バーコードをデコード
        decoded_objects = decode(frame)

        for obj in decoded_objects:
            barcode_data = obj.data.decode("utf-8")
            barcode_type = obj.type

            # バーコードが検出されたら枠を描画
            points = obj.polygon
            if len(points) == 4:
                pts = [(point.x, point.y) for point in points]
                cv2.polylines(
                    frame, [cv2.convexHull(cv2.UMat(pts).get())], True, (0, 255, 0), 3
                )

            # ISBNかどうか判定（ISBN-13またはISBN-10）
            if barcode_type == "EAN13" and barcode_data.startswith("978"):
                log_message(f"ISBNを検出しました: {barcode_data}")
                cap.release()
                cv2.destroyAllWindows()
                return barcode_data
            elif barcode_type == "EAN13":
                log_message(f"ISBN以外のバーコードです: {barcode_data}")

        # フレームを表示
        cv2.imshow("Barcode Scanner", frame)

        # ESCキーで終了
        if cv2.waitKey(1) & 0xFF == 27:
            break

    cap.release()
    cv2.destroyAllWindows()
    return None


def search_book_by_isbn(isbn: str):
    """ISBNで本を検索（Google Books API）"""
    log_message(f"ISBNで本を検索中: {isbn}")

    try:
        params = {"q": f"isbn:{isbn}"}
        response = requests.get(GOOGLE_BOOKS_API_URL, params=params, timeout=10)
        response.raise_for_status()

        data = response.json()

        if data.get("totalItems", 0) == 0:
            log_message(f"警告: ISBNに該当する本が見つかりませんでした: {isbn}")
            return None

        volume_info = data["items"][0]["volumeInfo"]

        # 著者情報の整形
        authors = volume_info.get("authors", [])
        author = "、".join(authors) if authors else "不明"

        # 出版日の取得と整形
        published_date = volume_info.get("publishedDate", "")
        if not published_date:
            # 出版日が取得できない場合は1970-01-01をデフォルトとする
            log_message(
                f"警告: 出版日が取得できませんでした - ISBN: {isbn} (デフォルト: 1970-01-01)"
            )
            published_date = "1970-01-01"
        elif len(published_date) == 7:  # YYYY-MM形式の場合
            # 日付が欠落している場合は1日を追加
            log_message(
                f"警告: 日付が欠落しています ({published_date}) - ISBN: {isbn} (補完: {published_date}-01)"
            )
            published_date = f"{published_date}-01"
        elif len(published_date) == 4:  # YYYY形式の場合
            # 月日が欠落している場合は01-01を追加
            log_message(
                f"警告: 月日が欠落しています ({published_date}) - ISBN: {isbn} (補完: {published_date}-01-01)"
            )
            published_date = f"{published_date}-01-01"
        elif len(published_date) < 10:  # その他の不完全な形式
            log_message(
                f"警告: 出版日の形式が不正です ({published_date}) - ISBN: {isbn} (デフォルト: 1970-01-01)"
            )
            published_date = "1970-01-01"

        book_info = {
            "isbn": isbn,
            "title": volume_info.get("title", "タイトル不明"),
            "author": author,
            "publisher": volume_info.get("publisher", "不明"),
            "publishedDate": published_date,
            "description": volume_info.get("description", ""),
            "thumbnail_url": volume_info.get("imageLinks", {}).get("thumbnail", ""),
        }

        log_message(f"本の情報を取得しました: {book_info['title']}")
        return book_info

    except requests.exceptions.RequestException as e:
        log_message(f"エラー: 本の検索に失敗しました - {e}")
        return None


def download_thumbnail(thumbnail_url: str, isbn: str):
    """表紙画像をダウンロードしてwebp形式で保存"""
    from pathlib import Path

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

        # RGBAモードの場合はRGBに変換（webpは透明度をサポートするが、背景を白にする）
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


def determine_category_and_tags(book_info: dict):
    """LM Studioを使ってカテゴリとタグを決定"""
    title = book_info["title"]
    author = book_info["author"]
    description = book_info.get("description", "")

    log_message("AIにカテゴリとタグを問い合わせ中...")

    # カテゴリを決定
    # カテゴリの選択肢を詳細説明付きで作成
    category_options = "\n".join(
        [f"- {value}: {label}" for value, label in BOOK_CATEGORIES.items()]
    )

    category_prompt = f"""
以下の本のカテゴリを決定してください。カテゴリは以下から1つだけ選んでください：

{category_options}

本の情報：
タイトル: {title}
著者: {author}
説明: {description[:200]}

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
説明: {description[:200]}

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


def create_mdoc_file(book_info: dict, category: str, tags: list):
    """mdocファイルを作成"""
    isbn = book_info["isbn"]
    log_message(f"mdocファイルを作成中: {isbn}")

    # タグのYAML配列形式を作成
    tags_yaml = ""
    if tags:
        tags_yaml = "tags:\n" + "\n".join([f"  - {tag}" for tag in tags])

    # publishedDateの処理（常にYYYY-MM-DD形式で渡されることを想定）
    published_date = book_info.get("publishedDate", "1970-01-01")
    published_date_yaml = f"publishedDate: {published_date}"

    # descriptionの処理（空の場合は項目自体を出力しない）
    description = book_info.get("description", "")
    description_yaml = f"description: {description}" if description else ""

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


def process_book():
    """1冊の本を処理"""
    # バーコードを読み取る
    isbn = read_barcode_from_camera()
    if not isbn:
        log_message("ISBNの取得に失敗しました")
        return False

    # 本の情報を検索
    book_info = search_book_by_isbn(isbn)
    if not book_info:
        log_message(f"本の情報の取得に失敗しました: {isbn}")
        return False

    # 表紙画像をダウンロード
    download_thumbnail(book_info["thumbnail_url"], isbn)

    # カテゴリとタグを決定
    category, tags = determine_category_and_tags(book_info)

    # mdocファイルを作成
    create_mdoc_file(book_info, category, tags)

    log_message(f"本の登録が完了しました: {book_info['title']}")
    return True


def main():
    """メイン処理"""
    print("=" * 60)
    print("本のバーコードスキャナー")
    print("=" * 60)

    # ディレクトリをセットアップ
    setup_directories()

    log_message("スクリプトを開始しました")

    while True:
        print("\n1: 本をスキャン")
        print("2: 終了")
        choice = input("選択してください: ")

        if choice == "1":
            process_book()
        elif choice == "2":
            log_message("スクリプトを終了しました")
            break
        else:
            print("無効な選択です")

    print("\n処理が完了しました。")
    print(f"出力先: {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
