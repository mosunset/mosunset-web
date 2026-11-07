# 全体の構成

## 技術

| 役割 | 使っているもの |
|---|---|
| フレームワーク | TanStack Start（React 19・ファイルベースルーティング） |
| 見た目 | Tailwind CSS v4 ＋ shadcn/ui |
| 実行環境 | Cloudflare Workers |
| データベース | Cloudflare D1（Drizzle ORM） |
| 画像 | Cloudflare R2（`/images/*` から配信） |
| 管理画面のログイン | Clerk |
| お問い合わせ | Turnstile（ロボット対策）＋ Email Routing（通知メール） |

## ページ

| パス | 内容 | ファイル |
|---|---|---|
| `/` | トップ | `src/routes/index.tsx` |
| `/blog` | ブログ | `src/routes/blog/` |
| `/instruments` `/certifications` `/toys` `/books` | コレクション | `src/routes/<種類>/`（中身は `src/lib/collection-routes.tsx`） |
| `/playground` | ブラウザで動く小さなツール | `src/routes/playground/` |
| `/contact` | お問い合わせ | `src/routes/contact.tsx` |
| `/admin` | 管理画面（記事・コレクション・お問い合わせ） | `src/routes/admin/` |
| `/images/*` | R2 の画像の配信 | `src/routes/images/$.ts` |
| `/rss.xml` `/sitemap.xml` `/robots.txt` `/llms.txt` | 機械向けのファイル | `src/routes/*[.]*.ts` |

## コードの分け方

- `src/routes/` … ページ。データの取得は server function を呼ぶだけにする
- `src/server/` … サーバーだけで動く処理（DB・R2・認証・メール）。画面側から直接 import しない
- `src/lib/` … 画面とサーバーの両方で使う処理
- `src/components/` … 画面の部品

## データの流れ

```
ブラウザ ── ページ (src/routes) ── server function (src/server) ──┬─ D1（記事・コレクション・お問い合わせ）
                                                                  ├─ R2（画像）
                                                                  └─ Clerk / Turnstile / Email
```
