# セキュリティ

| 対策 | 場所 |
|---|---|
| 管理画面の server function はすべて `adminMiddleware` を通す（Clerk の役割が admin の人だけ。下の「役割」）。画面側のチェックだけに頼らない | `src/functions/auth.ts`（判定は `src/server/auth.ts`） |
| DB・R2・秘密の値を扱うコードは `src/server` に置き、ブラウザ用のバンドルから import したらビルドを失敗させる | `vite.config.ts` の `importProtection` |
| server function の CSRF 対策（`start.ts` を置くと既定の対策が外れるので自分で入れている） | `src/start.ts` |
| CSP（スクリプトはリクエストごとの nonce が付いたものだけ）などのレスポンスヘッダー | `src/server/security-headers.ts`（`src/start.ts` のミドルウェアから呼ぶ） |
| 本文の JSON は保存前と表示前の両方で `sanitizeDoc` を通し、危険なリンクや画像を取り除く | `src/server/rich-text.ts` |
| 画像は大きさ（10MB まで）と先頭のバイトを確かめてから R2 に保存する。ISBN で取ってきた表紙も同じ | `src/server/images.ts` の `validateImageBytes` |
| 公開側の取得は、見ている人に見せてよいものだけに絞る（公開＝誰でも、限定公開＝役割が admin・viewer の人、未公開＝admin の人だけ）。サイトマップ・RSS・llms.txt・トップの新着は公開のものだけ。限定公開・未公開のページは noindex | `src/server/db/index.ts` の `postsVisibleTo` / `itemsVisibleTo`（判定は `src/server/auth.ts` の `resolveAccess`、状態は `src/lib/visibility.ts`） |
| 読むだけの GET で状態を変えない（お問い合わせを既読にするのは POST の `markMessageRead`） | `src/functions/contact.ts` |
| お問い合わせは Turnstile で確認してから保存する | `src/server/turnstile.ts` |
| 公開は mosunset.com だけ（workers.dev・プレビュー URL は無効） | `wrangler.jsonc` |
| 脆弱性の連絡先（`Expires` は 1 年以内なので期限の前に延ばす） | `/.well-known/security.txt` |

## 機能を足すときに確かめること

- [ ] 管理者だけが使う server function に `adminMiddleware` を付けたか
- [ ] 入力をサーバー側でも確かめているか（`src/server/validation.ts`）
- [ ] 画面のファイルから `src/server` を import していないか（`pnpm build` で分かる）
- [ ] 外部のスクリプト・画像・API を使うなら CSP に通信先を足したか
- [ ] 状態を変える処理を GET にしていないか
- [ ] 公開側の取得で `publishedPosts` / `publishedItems` を使っているか

## 役割（管理者・限定公開を見られる人）

サイトにはユーザー ID を持たず、Clerk のユーザーの **public metadata** で決めます（判定は `src/server/auth.ts` の `roleOf`）。

| 役割 | public metadata | できること |
|---|---|---|
| 管理者 | `{"role": "admin"}` | 管理画面・すべての記事とコレクション |
| 限定公開を見られる人 | `{"role": "viewer"}` | 公開と限定公開のもの |
| なし | 何も入れない | ログインしていない人と同じ（公開のものだけ） |

- public metadata は、本人がブラウザから書き換えられない（書けるのはダッシュボードとサーバーだけ）。unsafe metadata には入れない（本人が書き換えられる）
- Clerk のダッシュボードの Sessions →「Customize session token」に `{"metadata": "{{user.public_metadata}}"}` を入れて、ログイン中のトークンから API を呼ばずに読む。ここに固定の値（`{"metadata": {"role": "admin"}}` など）を書くと、ログインした全員がその役割になるので書かない
- 開発用と本番の Clerk のインスタンスは別なので、両方に入れる
- 役割を変えても、トークンが新しくなるまで（1 分ほど）は前の役割のまま。すぐ反映したいときはログインし直す
- お問い合わせの通知は、役割が admin の人のうち、いちばん先に登録した人のメールアドレスに送る（`src/server/notify.ts`）
