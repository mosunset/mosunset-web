"""楽天Books APIクライアント"""

import requests
from utils.logger import log_message

# 楽天Books API設定
RAKUTEN_APP_ID = "1087564174317084187"
RAKUTEN_API_URL = "https://app.rakuten.co.jp/services/api/BooksBook/Search/20170404"


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
