# デプロイ

`main` から手動でデプロイします。

```bash
pnpm check && pnpm typecheck
pnpm db:migrate:remote   # マイグレーションがあるときだけ
pnpm run deploy
```

## 本番のリソース

| 種類 | 名前 | 設定 |
|---|---|---|
| Worker | `mosunset-web` | `wrangler.jsonc` |
| D1 | `mosunset-web` | `d1_databases` |
| R2 | `mosunset-web-images` | `r2_buckets` |
| 秘密の値 | `CLERK_SECRET_KEY` / `ADMIN_USER_IDS` / `TURNSTILE_SECRET_KEY` | `wrangler secret put <名前>` |

本番のコンテンツは管理画面で直接編集します。`pnpm import:old-site` は開発用の D1 にだけ入れます。
