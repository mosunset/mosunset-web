"""ロギング機能"""

from datetime import datetime

from config import LOG_FILE


def log_message(message: str):
    """ログファイルとコンソールにメッセージを出力"""
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    log_entry = f"[{timestamp}] {message}\n"
    print(log_entry.strip())
    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write(log_entry)
