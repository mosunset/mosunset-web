# デプロイ

変更はブランチで作り、PR を通して `main` に入れます（2026-11-17 から）。`main` にマージされると、
GitHub Actions（`.github/workflows/deploy.yml`）が型チェック・Biome・ビルドを通してから本番にデプロイします。
手元からはデプロイしません（本番をいつも GitHub の `main` と同じものにするため。2026-11-15 から）。

```bash
git switch -c <ブランチ名>                 # main から作る
pnpm check && pnpm typecheck               # PR でも同じことをする。先に手元で通しておく
git push -u origin <ブランチ名>
gh pr create                               # PR を作ると、チェック（.github/workflows/check.yml）が流れる
pnpm db:migrate:remote                     # マイグレーションがあるときだけ。マージの前に流す（Actions では流さない）
gh pr merge --squash                       # またはマージコミット（--merge）。これでデプロイが始まる
```

- `main` は GitHub のルールセット「main を守る」で守っている。直接の push・強制 push・削除はできず、
  PR のチェック「チェック」が通らないとマージできない。管理者も例外にしていない。
  決まりを変えるときは、リポジトリの Settings → Rules → Rulesets
- マージの方法はスカッシュ（1 コミットにまとめる）とマージコミットから選ぶ。リベースは切っている
- マージしたブランチは GitHub 側で自動で消える。手元のブランチと worktree は別に片付ける
- 結果は PR の画面か、GitHub の Actions のタブで見る。デプロイの前のチェックで落ちたときはデプロイされない
- いま本番に出ている版は `npx wrangler deployments list`
- マイグレーションは、古いコードのままでも動く形（列を足すなど）にしておく。マージからデプロイまでのあいだも本番は動いているため
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
git switch <ブランチ名>   # PR にしたブランチ。main には直接 push できない
pnpm check && pnpm typecheck
pnpm run deploy   # `pnpm deploy` は pnpm の別のコマンドなので run を付ける
```

手元から出したあとは、そのブランチの PR を必ず `main` にマージしておく（本番と GitHub がずれないように）。

## 本番のリソース

| 種類 | 名前 | 設定 |
|---|---|---|
| Worker | `mosunset-web`（mosunset.com のみ） | `wrangler.jsonc` |
| D1 | `mosunset-web`（apac） | `d1_databases` |
| R2 | `mosunset-web-images` | `r2_buckets` |
| メール | Email Routing（送信元 `noreply@mosunset.com`） | `send_email`・`vars.CONTACT_FROM` |
| 公開してよい値 | `CLERK_PUBLISHABLE_KEY` / `TURNSTILE_SITE_KEY` | `vars` |
| 秘密の値 | `CLERK_SECRET_KEY` / `ADMIN_USER_IDS` / `TURNSTILE_SECRET_KEY` | `wrangler secret put <名前>` |
| 秘密の値（本の ISBN 検索。なくても動く） | `RAKUTEN_APP_ID` / `GOOGLE_BOOKS_API_KEY` | `wrangler secret put <名前>` |

`wrangler.jsonc` のバインディングを変えたら `pnpm cf-typegen` で型を作り直します。

## コンテンツ

- 本番のコンテンツは管理画面で直接編集する
- 旧サイトからの移行は 2026-11 に済み、取り込みのスクリプトと手直し版のコンテンツは消した。
  旧サイトの中身は Git の履歴（`0fa6d60`）にある
- 開発用の D1 に本番の記事とコレクションを写す手順は README の「はじめに」（お問い合わせは写さない）
