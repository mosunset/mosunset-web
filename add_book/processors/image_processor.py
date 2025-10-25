"""画像処理（サムネイルダウンロード・選択）"""

from io import BytesIO
from pathlib import Path
from urllib.parse import urlparse, urlunparse

import requests
from config import IMAGES_DIR
from PIL import Image
from utils.logger import log_message


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
