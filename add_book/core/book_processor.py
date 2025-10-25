"""本の処理（メイン処理ロジック）"""

from clients import (
    merge_book_info,
    search_book_by_google_api,
    search_book_by_rakuten_api,
)
from generators import create_mdoc_file
from processors import (
    determine_category_and_tags,
    generate_description_summary,
    select_best_thumbnail,
)
from utils import log_message


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
