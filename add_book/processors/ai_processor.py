"""AI処理（LM Studio）"""

import requests
from config import BOOK_CATEGORIES, LM_STUDIO_BASE_URL, LM_STUDIO_MODEL
from utils.logger import log_message


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
