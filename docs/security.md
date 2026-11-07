# セキュリティ

| 対策 | 場所 |
|---|---|
| 管理画面の server function はすべて `adminMiddleware` を通す（`ADMIN_USER_IDS` にいる Clerk ユーザーだけ）。画面側のチェックだけに頼らない | `src/functions/auth.ts`（判定は `src/server/auth.ts`） |
| DB・R2・秘密の値を扱うコードは `src/server` に置き、ブラウザ用のバンドルから import したらビルドを失敗させる | `vite.config.ts` の `importProtection` |
| server function の CSRF 対策（`start.ts` を置くと既定の対策が外れるので自分で入れている） | `src/start.ts` |
| CSP（スクリプトはリクエストごとの nonce が付いたものだけ）などのレスポンスヘッダー | `src/server/security-headers.ts`（`src/start.ts` のミドルウェアから呼ぶ） |
| 本文の JSON は保存前と表示前の両方で `sanitizeDoc` を通し、危険なリンクや画像を取り除く | `src/server/rich-text.ts` |
| 画像は大きさ（10MB まで）と先頭のバイトを確かめてから R2 に保存する。ISBN で取ってきた表紙も同じ | `src/server/images.ts` の `validateImageBytes` |
| 公開側の取得は公開中のものだけに絞る | `src/server/db/index.ts` の `publishedPosts` / `publishedItems` |
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
