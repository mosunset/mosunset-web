# セキュリティ

| 対策 | 場所 |
|---|---|
| 管理画面の server function はすべて `adminMiddleware` を通す（`ADMIN_USER_IDS` にいる Clerk ユーザーだけ） | `src/server/auth.ts` |
| 本文の JSON は保存前と表示前に `sanitizeDoc` を通す | `src/server/rich-text.ts` |
| CSP（nonce 付きのスクリプトだけ許可）などのレスポンスヘッダー | `src/server/security-headers.ts` |
| お問い合わせは Turnstile で確認してから保存する | `src/server/turnstile.ts` / `src/server/contact.ts` |
| 公開は mosunset.com だけ（workers.dev・プレビュー URL は無効） | `wrangler.jsonc` |
| 脆弱性の連絡先 | `/.well-known/security.txt`（`Expires` は 1 年以内に延ばす） |

外部のサービス（スクリプト・画像・API）を足すときは、CSP の通信先に足すのを忘れないこと。
