"""設定ファイル"""

import os
from pathlib import Path

# LM Studio設定
LM_STUDIO_BASE_URL = os.getenv("LM_STUDIO_BASE_URL", "http://localhost:1234/v1")
LM_STUDIO_MODEL = os.getenv("LM_STUDIO_MODEL", "gemma-3-12b-it")

# Google Books API設定
GOOGLE_BOOKS_API_URL = "https://www.googleapis.com/books/v1/volumes"

# 出力パス設定
BASE_DIR = Path(__file__).parent
OUTPUT_DIR = BASE_DIR / "output"
IMAGES_DIR = OUTPUT_DIR / "images" / "books"
CONTENT_DIR = OUTPUT_DIR / "content" / "books"
LOG_FILE = OUTPUT_DIR / "log.txt"

# mdocファイルのデフォルト値
DEFAULT_MDOC_VALUES = {
    "draft": False,
    "visibility": "public",
    "format": "紙",
    "status": "未読",
    "evaluation": "未評価",
}

# カテゴリの候補（keystatic.config.tsから）
BOOK_CATEGORIES = {
    "雑誌": "雑誌(季刊・月刊・週刊)",
    "コミック": "コミック（漫画・ライトノベル）",
    "文庫": "文庫(文芸・小説など)",
    "新書": "新書(読み物・教養書)",
    "文芸書": "文芸書(国内外文学・エッセイ・詩歌)",
    "実用書": "実用書(料理・健康・ホビー・暮らし)",
    "専門書": "専門書(人文・社会・理工・芸術・医学)",
    "ビジネス書": "ビジネス書(資格・経済・経営)",
    "児童書": "児童書(絵本・童話・図鑑・学習まんが)",
    "学習参考書": "学習参考書(小中高・辞書・辞典)",
    "画集": "画集・写真集(写真集)",
    "その他": "その他",
}
