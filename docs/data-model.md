# データモデル

定義は `src/server/db/schema.ts`、マイグレーションは `drizzle/` にあります。
スキーマを変えたら `pnpm db:generate` でマイグレーションを作り、`pnpm db:migrate:local` で開発用の D1 に当てます。

## posts（ブログ記事）

| 列 | 型 | 内容 |
|---|---|---|
| `id` | text | UUID |
| `slug` | text | URL に使う。重複不可 |
| `title` / `excerpt` | text | タイトル・概要 |
| `content` | json | 本文（Tiptap の JSON） |
| `cover_image_key` | text | R2 のキー |
| `status` | `draft` \| `published` | 公開状態 |
| `published_at` | timestamp | 公開日時 |

## collection_items（楽器・資格・おもちゃ・本）

| 列 | 型 | 内容 |
|---|---|---|
| `kind` | `instrument` \| `certification` \| `toy` \| `book` | 種類 |
| `slug` | text | 種類の中で重複不可 |
| `description` | json | 説明（Tiptap の JSON） |
| `image_key` | text | R2 のキー |
| `attributes` | json | 種類ごとの項目（メーカー・著者など） |
| `acquired_at` | text | 入手日・取得日 |
| `sort_order` | integer | 並び順 |
| `published` | boolean | 公開するか |

種類ごとの項目（`attributes` の中身）は `src/lib/collections.ts` で決めています。項目を足すときは DB を変えず、ここに足します。

## contact_messages（お問い合わせ）

| 列 | 型 | 内容 |
|---|---|---|
| `name` / `email` / `subject` / `body` | text | 送られてきた内容 |
| `read_at` | timestamp | 管理画面で読んだ日時 |
