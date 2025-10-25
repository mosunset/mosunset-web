"""本のバーコードからISBNを取得し、Google & 楽天APIで情報を統合してAstro Contentsに追加するスクリプト"""

from datetime import datetime
from io import BytesIO
from pathlib import Path
from urllib.parse import urlparse, urlunparse

import cv2
import numpy as np
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


def continuous_barcode_scan():
    """カメラを起動したまま連続してバーコードを読み取る"""
    log_message("カメラを起動しています...")
    cap = cv2.VideoCapture(1)

    if not cap.isOpened():
        log_message("エラー: カメラを開けませんでした")
        return

    log_message("バーコードをカメラにかざしてください (ESCキーで終了)")
    log_message("ISBN検出後、自動的に処理を開始します")

    last_isbn = None
    processing = False

    try:
        while True:
            ret, frame = cap.read()
            if not ret:
                log_message("エラー: フレームの取得に失敗しました")
                break

            # 処理中でない場合のみバーコードをスキャン
            if not processing:
                # バーコードをデコード
                decoded_objects = decode(frame)

                for obj in decoded_objects:
                    barcode_data = obj.data.decode("utf-8")
                    barcode_type = obj.type

                    # バーコードが検出されたら枠を描画
                    points = obj.polygon
                    if len(points) == 4:
                        pts = np.array(
                            [(point.x, point.y) for point in points], dtype=np.int32
                        )
                        cv2.polylines(
                            frame,
                            [pts],
                            True,
                            (0, 255, 0),
                            3,
                        )

                    # ISBNかどうか判定（ISBN-13またはISBN-10）
                    if barcode_type == "EAN13" and barcode_data.startswith("978"):
                        # 同じISBNを連続で読み取らないようにする
                        if barcode_data != last_isbn:
                            log_message(f"ISBNを検出しました: {barcode_data}")
                            last_isbn = barcode_data
                            processing = True

                            # ISBNを処理
                            process_single_book(barcode_data)

                            processing = False
                            log_message(
                                "次のバーコードをかざしてください (ESCキーで終了)"
                            )

                    elif barcode_type == "EAN13":
                        log_message(f"ISBN以外のバーコードです: {barcode_data}")

            # 処理中の表示
            if processing:
                cv2.putText(
                    frame,
                    "Processing...",
                    (10, 30),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    1,
                    (0, 0, 255),
                    2,
                )

            # フレームを表示
            cv2.imshow("Barcode Scanner (ESC to quit)", frame)

            # ESCキーで終了
            if cv2.waitKey(1) & 0xFF == 27:
                log_message("スキャンを終了します")
                break

    finally:
        cap.release()
        cv2.destroyAllWindows()


def read_barcode_from_camera():
    """カメラからバーコードを読み取る（後方互換性のため残す）"""
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
                pts = np.array([(point.x, point.y) for point in points], dtype=np.int32)
                cv2.polylines(frame, [pts], True, (0, 255, 0), 3)

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


def search_book_by_google_api(isbn: str):
    """ISBNで本を検索（Google Books API）"""
    log_message(f"Google Books APIで本を検索中: {isbn}")

    try:
        params = {"q": f"isbn:{isbn}"}
        response = requests.get(GOOGLE_BOOKS_API_URL, params=params, timeout=10)
        response.raise_for_status()

        data = response.json()

        if data.get("totalItems", 0) == 0:
            log_message(f"Google API: ISBNに該当する本が見つかりませんでした: {isbn}")
            return None

        volume_info = data["items"][0]["volumeInfo"]

        # 著者情報の整形
        authors = volume_info.get("authors", [])
        author = "、".join(authors) if authors else ""

        # 出版日の取得
        published_date = volume_info.get("publishedDate", "")

        book_info = {
            "source": "google",
            "isbn": isbn,
            "title": volume_info.get("title", ""),
            "author": author,
            "publisher": volume_info.get("publisher", ""),
            "publishedDate": published_date,
            "description": volume_info.get("description", ""),
            "thumbnail_url": volume_info.get("imageLinks", {}).get("thumbnail", ""),
            "itemCaption": "",  # Googleにはない
        }

        log_message(f"Google API: 本の情報を取得しました: {book_info['title']}")
        return book_info

    except requests.exceptions.RequestException as e:
        log_message(f"Google API: 本の検索に失敗しました - {e}")
        return None


def search_book_by_rakuten_api(isbn: str):
    """楽天Books APIでISBNから本を検索"""
    log_message(f"楽天Books APIで本を検索中: {isbn}")

    try:
        params = {"format": "json", "isbn": isbn, "applicationId": RAKUTEN_APP_ID}
        response = requests.get(RAKUTEN_API_URL, params=params, timeout=10)
        response.raise_for_status()

        data = response.json()

        if data.get("count", 0) == 0:
            log_message(f"楽天API: ISBNに該当する本が見つかりませんでした: {isbn}")
            return None

        item_info = data["Items"][0]["Item"]

        # 出版日の取得
        sales_date = item_info.get("salesDate", "")

        # itemCaptionを取得
        item_caption = item_info.get("itemCaption", "")

        book_info = {
            "source": "rakuten",
            "isbn": isbn,
            "title": item_info.get("title", ""),
            "author": item_info.get("author", ""),
            "publisher": item_info.get("publisherName", ""),
            "publishedDate": sales_date,
            "description": "",  # 楽天にはない（後でitemCaptionから要約を生成）
            "thumbnail_url": item_info.get("largeImageUrl", ""),
            "itemCaption": item_caption,
        }

        log_message(f"楽天API: 本の情報を取得しました: {book_info['title']}")
        return book_info

    except requests.exceptions.RequestException as e:
        log_message(f"楽天API: 本の検索に失敗しました - {e}")
        return None


def get_text_length(text):
    """テキストの長さを取得（Noneや空文字は0）"""
    if not text:
        return 0
    return len(str(text))


def merge_book_info(google_info, rakuten_info):
    """2つのAPIからの情報を統合し、より詳細な情報を採用"""
    if not google_info and not rakuten_info:
        return None

    if not google_info:
        log_message("統合: Google APIの情報がないため、楽天APIのみ使用")
        return rakuten_info

    if not rakuten_info:
        log_message("統合: 楽天APIの情報がないため、Google APIのみ使用")
        return google_info

    log_message("情報を統合中...")

    merged = {
        "isbn": google_info["isbn"],
        "title": "",
        "author": "",
        "publisher": "",
        "publishedDate": "",
        "description": "",
        "thumbnail_url": "",
        "itemCaption": rakuten_info.get("itemCaption", ""),
    }

    # 各項目について情報量が多い方を採用
    fields = [
        "title",
        "author",
        "publisher",
        "publishedDate",
        "description",
        "thumbnail_url",
    ]

    for field in fields:
        google_val = google_info.get(field, "")
        rakuten_val = rakuten_info.get(field, "")

        google_len = get_text_length(google_val)
        rakuten_len = get_text_length(rakuten_val)

        if google_len > rakuten_len:
            merged[field] = google_val
            if google_len > 0 and rakuten_len > 0:
                log_message(
                    f"  {field}: Google採用 (Google: {google_len}文字, 楽天: {rakuten_len}文字)"
                )
            elif google_len > 0:
                log_message(f"  {field}: Google採用 (楽天は情報なし)")
        elif rakuten_len > 0:
            merged[field] = rakuten_val
            if google_len > 0 and rakuten_len > 0:
                log_message(
                    f"  {field}: 楽天採用 (Google: {google_len}文字, 楽天: {rakuten_len}文字)"
                )
            else:
                log_message(f"  {field}: 楽天採用 (Googleは情報なし)")

    log_message("情報の統合が完了しました")
    return merged


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


def generate_description_summary(item_caption: str, existing_description: str):
    """itemCaptionまたは既存のdescriptionから要約を生成"""
    # itemCaptionがあればそれを優先、なければ既存のdescriptionを使用
    source_text = item_caption if item_caption else existing_description

    if not source_text:
        return ""

    log_message("AIにdescription要約を問い合わせ中...")

    summary_prompt = f"""
以下の本の説明文を2〜3行程度に要約してください。重要なポイントを簡潔にまとめてください。

説明文:
{source_text[:500]}

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
    # itemCaptionがあればそれを優先、なければdescriptionを使用
    description = book_info.get("itemCaption", "") or book_info.get("description", "")

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
説明: {description[:300]}

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
説明: {description[:300]}

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


def download_image(url: str, remove_query_params: bool = False):
    """URLから画像をダウンロードしてPIL Imageオブジェクトを返す

    Args:
        url: 画像のURL
        remove_query_params: クエリパラメータを削除するかどうか（デフォルト: False）
    """
    if not url:
        return None

    # 必要に応じてURLからクエリパラメータを除去
    download_url = url
    if remove_query_params:
        parsed = urlparse(url)
        download_url = urlunparse(parsed._replace(query="", fragment=""))

    try:
        response = requests.get(download_url, timeout=10)
        response.raise_for_status()
        img = Image.open(BytesIO(response.content))
        return img
    except Exception as e:
        log_message(f"画像のダウンロードに失敗: {download_url} - {e}")
        return None


def is_rakuten_no_image_url(url: str):
    """楽天の「画像なし」URLかどうかを判定"""
    if not url:
        return False

    # 楽天のnoimage URLパターン
    no_image_patterns = [
        "noimage",
        "no-image",
        "no_image",
    ]

    url_lower = url.lower()
    return any(pattern in url_lower for pattern in no_image_patterns)


def is_no_image_placeholder(img: Image.Image):
    """楽天の「画像はありません」画像かどうかを判定（画像サイズで判定）"""
    if img is None:
        return False

    width, height = img.size

    # 縦横比が1:1に近い（0.9～1.1の範囲）場合は「画像なし」の可能性が高い
    aspect_ratio = width / height if height > 0 else 0
    if 0.9 <= aspect_ratio <= 1.1:
        # さらに解像度が低い（200x200以下）場合はプレースホルダーの可能性が高い
        if width <= 200 and height <= 200:
            return True

    return False


def save_image_as_webp(img: Image.Image, output_path: Path):
    """PIL ImageをWebP形式で保存"""
    # RGBAモードの場合はRGBに変換
    if img.mode in ("RGBA", "LA", "P"):
        background = Image.new("RGB", img.size, (255, 255, 255))
        if img.mode == "P":
            img = img.convert("RGBA")
        background.paste(
            img, mask=img.split()[-1] if img.mode in ("RGBA", "LA") else None
        )
        img = background

    img.save(output_path, "WEBP", quality=90)


def save_default_image(output_path: Path):
    """デフォルト画像(unknown.png)を保存"""
    unknown_path = Path(__file__).parent / "unknown.png"
    if unknown_path.exists():
        try:
            img = Image.open(unknown_path)
            save_image_as_webp(img, output_path)
            log_message(f"デフォルト画像を保存しました: {output_path}")
            return True
        except Exception as e:
            log_message(f"エラー: デフォルト画像の保存に失敗しました - {e}")
            return False
    else:
        log_message("エラー: unknown.pngが見つかりません")
        return False


def select_best_thumbnail(google_url: str, rakuten_url: str, isbn: str):
    """GoogleとRakutenから最適なサムネイル画像を選択してダウンロード"""
    # 保存先ディレクトリを作成
    isbn_dir = IMAGES_DIR / isbn
    isbn_dir.mkdir(exist_ok=True)
    output_path = isbn_dir / "thumbnail.webp"

    # 楽天のURLが「画像なし」URLかチェック
    rakuten_url_is_noimage = is_rakuten_no_image_url(rakuten_url)

    if rakuten_url_is_noimage:
        log_message("楽天の画像URLが「画像なし」URLです")
        # Googleの画像のみをダウンロード
        if google_url:
            log_message("Googleの画像のみをダウンロードします")
            google_img = download_image(google_url, False)
            if google_img:
                save_image_as_webp(google_img, output_path)
                log_message(
                    f"Googleの画像を保存しました ({google_img.size[0]}x{google_img.size[1]}): {output_path}"
                )
                return True
        # Googleの画像もない場合はデフォルト画像
        log_message("Googleの画像も取得できないため、デフォルト画像を使用します")
        return save_default_image(output_path)

    log_message("両方のAPIからサムネイル画像をダウンロード中...")

    # 両方の画像をダウンロード
    google_img = download_image(google_url, False) if google_url else None
    rakuten_img = download_image(rakuten_url, True) if rakuten_url else None

    # 両方ともダウンロードできなかった場合
    if google_img is None and rakuten_img is None:
        log_message("警告: どちらのAPIからも画像を取得できませんでした")
        return save_default_image(output_path)

    # 片方だけダウンロードできた場合
    if google_img is None and rakuten_img is not None:
        log_message("Googleの画像が取得できなかったため、楽天の画像を使用します")
        save_image_as_webp(rakuten_img, output_path)
        log_message(
            f"楽天の画像を保存しました ({rakuten_img.size[0]}x{rakuten_img.size[1]}): {output_path}"
        )
        return True

    if rakuten_img is None and google_img is not None:
        log_message("楽天の画像が取得できなかったため、Googleの画像を使用します")
        save_image_as_webp(google_img, output_path)
        log_message(
            f"Googleの画像を保存しました ({google_img.size[0]}x{google_img.size[1]}): {output_path}"
        )
        return True

    # 両方ダウンロードできた場合
    google_size = google_img.size
    rakuten_size = rakuten_img.size
    google_pixels = google_size[0] * google_size[1]
    rakuten_pixels = rakuten_size[0] * rakuten_size[1]

    log_message(
        f"Google画像: {google_size[0]}x{google_size[1]} ({google_pixels}ピクセル)"
    )
    log_message(
        f"楽天画像: {rakuten_size[0]}x{rakuten_size[1]} ({rakuten_pixels}ピクセル)"
    )

    # 楽天の画像が「画像なし」プレースホルダーかチェック（画像サイズで判定）
    rakuten_is_placeholder = is_no_image_placeholder(rakuten_img)

    if rakuten_is_placeholder:
        log_message("警告: 楽天の画像は「画像なし」プレースホルダーの可能性があります")
        print("\n" + "=" * 60)
        print("サムネイル画像を選択してください:")
        print(f"1: Google画像 ({google_size[0]}x{google_size[1]})")
        print(
            f"2: 楽天画像 ({rakuten_size[0]}x{rakuten_size[1]}) ※プレースホルダーの可能性あり"
        )
        print("3: デフォルト画像 (unknown.png)")
        print("=" * 60)

        while True:
            choice = input("選択 (1-3): ").strip()
            if choice == "1":
                save_image_as_webp(google_img, output_path)
                log_message(f"Googleの画像を保存しました: {output_path}")
                return True
            elif choice == "2":
                save_image_as_webp(rakuten_img, output_path)
                log_message(f"楽天の画像を保存しました: {output_path}")
                return True
            elif choice == "3":
                return save_default_image(output_path)
            else:
                print("無効な選択です。1-3の数字を入力してください。")

    # 楽天の画像が正常な場合は解像度で比較
    if rakuten_pixels > google_pixels:
        log_message(
            f"楽天の画像の方が高解像度です（差分: +{rakuten_pixels - google_pixels}ピクセル）"
        )
        save_image_as_webp(rakuten_img, output_path)
        log_message(f"楽天の画像を保存しました: {output_path}")
    else:
        log_message(
            f"Googleの画像の方が高解像度です（差分: +{google_pixels - rakuten_pixels}ピクセル）"
        )
        save_image_as_webp(google_img, output_path)
        log_message(f"Googleの画像を保存しました: {output_path}")

    return True


def create_mdoc_file(book_info: dict, category: str, tags: list, description: str):
    """mdocファイルを作成"""
    isbn = book_info["isbn"]
    log_message(f"mdocファイルを作成中: {isbn}")

    # タグのYAML配列形式を作成
    tags_yaml = ""
    if tags:
        tags_yaml = "tags:\n" + "\n".join([f"  - {tag}" for tag in tags])

    # publishedDateの処理（AIで変換）
    published_date = convert_date_with_ai(book_info.get("publishedDate", ""), isbn)
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


def process_single_book(isbn: str):
    """ISBNから1冊の本を処理"""
    log_message(f"=== 処理開始: ISBN {isbn} ===")

    # Google APIで本の情報を検索
    google_info = search_book_by_google_api(isbn)

    # 楽天APIで本の情報を検索
    rakuten_info = search_book_by_rakuten_api(isbn)

    # 情報を統合
    book_info = merge_book_info(google_info, rakuten_info)

    if not book_info:
        log_message(f"本の情報の取得に失敗しました: {isbn}")
        return False

    # 表紙画像を両方のAPIからダウンロードして最適なものを選択
    google_thumbnail_url = google_info.get("thumbnail_url", "") if google_info else ""
    rakuten_thumbnail_url = (
        rakuten_info.get("thumbnail_url", "") if rakuten_info else ""
    )
    select_best_thumbnail(google_thumbnail_url, rakuten_thumbnail_url, isbn)

    # descriptionの要約を生成
    description = generate_description_summary(
        book_info.get("itemCaption", ""), book_info.get("description", "")
    )

    # カテゴリとタグを決定
    category, tags = determine_category_and_tags(book_info)

    # mdocファイルを作成
    create_mdoc_file(book_info, category, tags, description)

    log_message(f"本の登録が完了しました: {book_info['title']}")
    log_message(f"=== 処理完了: ISBN {isbn} ===\n")
    return True


def process_book():
    """1冊の本を処理（カメラからISBNを取得）"""
    # バーコードを読み取る
    isbn = read_barcode_from_camera()
    if not isbn:
        log_message("ISBNの取得に失敗しました")
        return False

    return process_single_book(isbn)


def main():
    """メイン処理"""
    print("=" * 60)
    print("本のバーコードスキャナー (Google & 楽天API統合版)")
    print("=" * 60)

    # ディレクトリをセットアップ
    setup_directories()

    log_message("スクリプトを開始しました")

    while True:
        print("\n1: 連続スキャンモード（カメラ起動のまま）")
        print("2: 単発スキャンモード（1冊ずつ）")
        print("3: 終了")
        choice = input("選択してください: ")

        if choice == "1":
            continuous_barcode_scan()
        elif choice == "2":
            process_book()
        elif choice == "3":
            log_message("スクリプトを終了しました")
            break
        else:
            print("無効な選択です")

    print("\n処理が完了しました。")
    print(f"出力先: {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
