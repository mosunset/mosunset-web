"""API情報のマージ処理"""

from utils.helpers import get_text_length
from utils.logger import log_message


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
