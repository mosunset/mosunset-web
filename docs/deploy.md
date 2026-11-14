# デプロイ

`main` から手動でデプロイします（2026-11-07 に新サイトを公開）。

```bash
git switch main && git pull
pnpm check && pnpm typecheck
pnpm db:migrate:remote   # マイグレーションがあるときだけ
pnpm run deploy          # `pnpm deploy` は pnpm の別のコマンドなので run を付ける
```

## 本番のリソース

| 種類 | 名前 | 設定 |
|---|---|---|
| Worker | `mosunset-web`（mosunset.com のみ） | `wrangler.jsonc` |
| D1 | `mosunset-web`（apac） | `d1_databases` |
| R2 | `mosunset-web-images` | `r2_buckets` |
| メール | Email Routing（送信元 `noreply@mosunset.com`） | `send_email`・`vars.CONTACT_FROM` |
| 公開してよい値 | `CLERK_PUBLISHABLE_KEY` / `TURNSTILE_SITE_KEY` | `vars` |
| 秘密の値 | `CLERK_SECRET_KEY` / `ADMIN_USER_IDS` / `TURNSTILE_SECRET_KEY` | `wrangler secret put <名前>` |

`wrangler.jsonc` のバインディングを変えたら `pnpm cf-typegen` で型を作り直します。

## コンテンツ

- 本番のコンテンツは管理画面で直接編集する
- `pnpm import:old-site` は開発用の D1 にだけ入れる
- 開発用の画像を本番の R2 に送るときは `pnpm push-images:remote`
