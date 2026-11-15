# デプロイ

GitHub の `main` に push すると、GitHub Actions（`.github/workflows/deploy.yml`）が
型チェック・Biome・ビルドを通してから本番にデプロイします。手元からはデプロイしません
（本番をいつも GitHub の `main` と同じものにするため。2026-11-15 から）。

```bash
pnpm check && pnpm typecheck   # Actions でも同じことをする。先に手元で通しておく
pnpm db:migrate:remote         # マイグレーションがあるときだけ。push の前に流す（Actions では流さない）
git push origin main           # これでデプロイが始まる
```

- 結果は GitHub の Actions のタブか、コミットの横の ✓ / ✗ で見る。チェックで落ちたときはデプロイされない
- いま本番に出ている版は `npx wrangler deployments list`
- マイグレーションは、古いコードのままでも動く形（列を足すなど）にしておく。push からデプロイまでのあいだも本番は動いているため
- 流し直したいときは、Actions のタブの「デプロイ」から Run workflow
- Cloudflare 側の自動ビルド（ダッシュボードの Workers Builds・Git 連携）は使わない。2026-11-15 に切断した。
  つなぐと push のたびに Actions とは別にビルドが走り、チェックなしのデプロイが重なるおそれがある。
  Cloudflare のダッシュボードでは、Actions からのデプロイは「手動で展開（Wrangler）」と表示される

## 初めの設定（1 回だけ）

1. Cloudflare のダッシュボードで API トークンを作る（My Profile → API Tokens → Create Token →
   テンプレート「Edit Cloudflare Workers」。アカウントは自分のもの、ゾーンは `mosunset.com`）
2. GitHub のリポジトリの Settings → Secrets and variables → Actions → New repository secret に、
   名前 `CLOUDFLARE_API_TOKEN` で入れる

## Actions が使えないときだけ、手元からデプロイする

```bash
git switch main && git pull
pnpm check && pnpm typecheck
pnpm run deploy   # `pnpm deploy` は pnpm の別のコマンドなので run を付ける
```

手元から出したあとは、同じコミットを必ず `main` に push しておく（本番と GitHub がずれないように）。

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
- 旧サイトからの移行は 2026-11 に済み、取り込みのスクリプトと手直し版のコンテンツは消した。
  旧サイトの中身は Git の履歴（`0fa6d60`）にある
- 開発用の D1 に本番の記事とコレクションを写す手順は README の「はじめに」（お問い合わせは写さない）
