# 旧サイトから移したコンテンツの手直し

`pnpm import:old-site` は、旧サイト（Git の履歴 `0fa6d60`）のコンテンツを取り込むときに、
ここにファイルがあれば旧サイトの原文の代わりにこちらを使います。

```
content/migration/
  blog/<旧サイトのファイル名>.md
  certifications/<旧サイトのファイル名>.md
  instruments/<旧サイトのファイル名>.md
```

- 本文は Markdown。旧サイトの本文をまるごと置き換えます
- frontmatter に書いた項目だけ、旧サイトの値を上書きします
  - ブログ: `title` / `slug` / `description` / `publishedDate` / `updatedDate` / `thumbnail`（空にすると表紙なし）/ `visibility`
  - コレクション: `title` / `slug` / `attributes`（書いた項目だけ上書き）
- 画像は旧サイトのパス（`/images/...` や `@assets/...`）のまま書けば、取り込み時に R2 へ移します

旧サイトの原文と比べたいときは、`git show 0fa6d60:src/content/blog/<名前>.mdoc` で見られます。

## 画像を差し替える

旧サイトの画像に番号など公開したくないものが写っているときは、隠した版を
`content/migration/images/<旧サイトでのパス>` に置くと、取り込み時にそちらを使います。

例：`content/migration/images/src/assets/images/qualifications/fe/thumbnail.webp`
