"""Google Books APIクライアント"""

import requests
from config import GOOGLE_BOOKS_API_URL
from utils.logger import log_message


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
