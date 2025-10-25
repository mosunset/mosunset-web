"""mdocファイル生成"""

from config import CONTENT_DIR, DEFAULT_MDOC_VALUES
from processors.ai_processor import convert_date_with_ai
from utils.logger import log_message


def create_mdoc_file(book_info: dict, category: str, tags: list, description: str):
    """mdocファイルを作成"""
    isbn = book_info["isbn"]
    log_message(f"mdocファイルを作成中: {isbn}")

    # タグのYAML配列形式を作成
    tags_yaml = ""
    if tags:
        tags_yaml = "tags:\n" + "\n".join([f"  - {tag}" for tag in tags])

    # publishedDateの処理（AIで変換）
    published_date = convert_date_with_ai(book_info.get("publishedDate", ""), isbn)
    published_date_yaml = f"publishedDate: {published_date}"

    # descriptionの処理
    description_yaml = f"description: {description}" if description else ""

    # itemCaptionを本文として追加
    item_caption = book_info.get("itemCaption", "")

    # mdocファイルの内容を作成
    mdoc_content = f"""---
draft: {str(DEFAULT_MDOC_VALUES["draft"]).lower()}
visibility: {DEFAULT_MDOC_VALUES["visibility"]}
isbn: '{isbn}'
title: {book_info["title"]}
author: {book_info["author"]}
publisher: {book_info["publisher"]}
{published_date_yaml}
{description_yaml}
thumbnail: '@assets/images/books/{isbn}/thumbnail.webp'
category: {category}
{tags_yaml}
format: {DEFAULT_MDOC_VALUES["format"]}
status: {DEFAULT_MDOC_VALUES["status"]}
evaluation: {DEFAULT_MDOC_VALUES["evaluation"]}
---
{item_caption}
"""

    # 空行を整理（連続する空行を1つにまとめる）
    lines = mdoc_content.split("\n")
    cleaned_lines = []
    prev_empty = False
    for line in lines:
        is_empty = line.strip() == ""
        if is_empty and prev_empty:
            continue  # 連続する空行をスキップ
        cleaned_lines.append(line)
        prev_empty = is_empty
    mdoc_content = "\n".join(cleaned_lines)

    # mdocファイルを保存
    mdoc_path = CONTENT_DIR / f"{isbn}.mdoc"
    with open(mdoc_path, "w", encoding="utf-8") as f:
        f.write(mdoc_content)

    log_message(f"mdocファイルを作成しました: {mdoc_path}")
    return mdoc_path
