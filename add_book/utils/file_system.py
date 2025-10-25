"""ファイルシステム関連のユーティリティ"""

from config import CONTENT_DIR, IMAGES_DIR, OUTPUT_DIR


def setup_directories():
    """出力ディレクトリを作成"""
    OUTPUT_DIR.mkdir(exist_ok=True)
    IMAGES_DIR.mkdir(parents=True, exist_ok=True)
    CONTENT_DIR.mkdir(parents=True, exist_ok=True)
