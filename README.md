# mosunset-web

[mosunset.com](https://mosunset.com) のソースコードです。ブログ・プレイグラウンド（ブラウザで動く小さなツール）・楽器や資格などのコレクションを置いています。

- [TanStack Start](https://tanstack.com/start)（React 19）＋ Tailwind CSS v4 ＋ shadcn/ui
- Cloudflare Workers で動かし、データは D1（Drizzle ORM）、画像は R2 に置く
- 管理画面のログインは Clerk、お問い合わせのロボット対策は Turnstile

## はじめに

```bash
pnpm install
pnpm db:migrate:local   # 開発用のデータベースを作る
pnpm import:old-site    # 旧サイトのコンテンツを開発用のデータベースに入れる（任意）
pnpm dev                # http://localhost:3000
```

開発用の秘密の値は `.dev.vars` に書きます（Git には入れない）。

```bash
CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
ADMIN_USER_IDS=user_...          # 管理画面に入れる Clerk のユーザー ID（カンマ区切り）
TURNSTILE_SITE_KEY=1x00000000000000000000AA   # 開発中は Cloudflare のテスト用キー
```

> **Windows の場合:** ローカルの Workers ランタイム（workerd）には Visual C++ 再頒布可能パッケージが要ります。
> `pnpm dev` が `write EOF` で止まるときは `winget install Microsoft.VCRedist.2015+.x64` を入れてください。

## よく使うコマンド

| コマンド | 内容 |
|---|---|
| `pnpm dev` | 開発用サーバー |
| `pnpm check` / `pnpm typecheck` | Biome（lint・整形）と型チェック |
| `pnpm build` / `pnpm preview` | 本番用のビルドと、その確認 |
| `pnpm db:generate` | `src/server/db/schema.ts` を変えたあと、マイグレーションを作る |
| `pnpm db:migrate:local` / `db:migrate:remote` | マイグレーションを開発用 / 本番の D1 に当てる |
| `pnpm run deploy` | ビルドして本番（Cloudflare Workers）に出す（`pnpm deploy` は pnpm の別のコマンドなので `run` を付ける） |
| `pnpm cf-typegen` | `wrangler.jsonc` のバインディングを変えたあと、型を作り直す |

## ファイルの置き場所

```
src/
  routes/        ページ（TanStack Router のファイルベースルーティング）。admin/ は管理画面
  components/    画面の部品。ui/ は shadcn/ui、admin/ は管理画面、playground/ はツール
  hooks/         React のフック
  functions/     server function（画面から呼ぶ API）。posts・collections・contact・images・isbn・dashboard・auth
  server/        サーバーの中だけで使う処理（DB・R2・認証・メール・Turnstile・本文の無害化・ヘッダー・フィードなど）
  lib/           画面とサーバーの両方で使う処理（SEO・コレクションの定義・画像の URL など）
  start.ts       リクエストごとのミドルウェア（セキュリティのヘッダー・CSRF・Clerk）
content/migration/  旧サイトから移したコンテンツの手直し版（取り込みスクリプト用）
scripts/         旧サイトの取り込みと、画像を本番の R2 に送るスクリプト
drizzle/         D1 のマイグレーション
```

中身は 3 つの層に分けています。

| 層 | 置き場所 | import してよいもの |
|---|---|---|
| 画面 | `src/routes`・`src/components`・`src/hooks` | `src/functions`・`src/lib` |
| API | `src/functions`（`createServerFn` と `adminMiddleware`） | `src/server`・`src/lib` |
| サーバーの中身 | `src/server` | `src/lib` |

- `src/lib` は `src/server` も `src/functions` も import しません（型だけでも）。両方で使う型や定数は `src/lib` に置きます（例: コレクションの種類は `src/lib/collection-kinds.ts`）。
- 画面のファイルから `src/server` を import すると、`pnpm build` が import protection のエラーで止まります（`vite.config.ts` の `importProtection`）。server function の handler や `.server()` の中でだけ使うものは、ブラウザ用のバンドルでは消えるので通ります。
- 例外は、画面を持たない server route（`sitemap.xml`・`rss.xml`・`llms.txt`・`/images/$`）と `src/start.ts` です。どちらも `server.handlers` や `.server()` の中から `src/server` の関数を呼ぶだけにしています。
- コレクション（楽器・資格・おもちゃ・本）の種類と項目は `src/lib/collections.ts` の 1 か所で決めています。管理画面の入力欄・サーバーでの入力チェック・公開ページの表示は、ここから作ります。
- プレイグラウンドのツールは `src/lib/playground.ts` に 1 件足し、`src/routes/playground/<slug>.tsx` と `src/components/playground/tools/` にファイルを作ります。重いライブラリを使うツールは `clientOnlyTool` でブラウザでだけ読み込みます（Worker に入れない）。

## セキュリティ

- 管理画面のデータを読み書きする server function には、すべて `adminMiddleware`（`src/functions/auth.ts`。判定は `src/server/auth.ts`）を付けます。画面側のチェックだけに頼りません。
- DB・R2・秘密の値（`TURNSTILE_SECRET_KEY`・`ADMIN_USER_IDS` など）を扱うコードは `src/server` に置き、ブラウザ用のバンドルに入らないことをビルドで確かめています（上の「ファイルの置き場所」）。
- 本文（Tiptap の JSON）は、保存前と表示前の両方で `sanitizeDoc`（`src/server/rich-text.ts`）を通し、危険なリンクや画像を取り除きます。
- レスポンスには CSP（スクリプトはリクエストごとの nonce が付いたものだけ）などのヘッダーを付けます（`src/server/security-headers.ts`。`src/start.ts` のミドルウェアから呼ぶ）。外部のサービスを足すときは、ここに通信先を足します。
- 脆弱性の連絡先は `/.well-known/security.txt` です。`Expires` は 1 年以内にする決まりなので、期限の前に延ばします。

## 本番

- 本番の D1・R2・Turnstile のサイトキーなどは `wrangler.jsonc` にあります。秘密の値（`CLERK_SECRET_KEY`・`ADMIN_USER_IDS`・`TURNSTILE_SECRET_KEY`）は `wrangler secret put <名前>` で入れます。
- 本番のコンテンツは管理画面で直接編集します。`pnpm import:old-site` は開発用のデータベースにだけ入れます。
