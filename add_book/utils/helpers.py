"""ヘルパー関数"""


def get_text_length(text):
    """テキストの長さを取得（Noneや空文字は0）"""
    if not text:
        return 0
    return len(str(text))
