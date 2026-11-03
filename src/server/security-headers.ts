import { createMiddleware } from '@tanstack/react-start'

/**
 * Content-Security-Policy。
 * script-src などを絞ると、Clerk・Turnstile・プレイグラウンドの外部モデルや、
 * TanStack Start が出すインラインのスクリプトが動かなくなるので、
 * ここでは壊れる心配のない指定だけにしている（クリックジャッキング・<base> の差し替え・プラグインの読み込みを防ぐ）
 */
const csp = [
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
]

/** すべてのページ・API に付ける */
const commonHeaders: Record<string, string> = {
  // 中身の種類をブラウザに推測させない
  'X-Content-Type-Options': 'nosniff',
  // ほかのサイトへ移るときは、URL のパスやクエリを渡さない
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  // ほかのサイトの iframe に埋め込ませない（古いブラウザ向け。新しいブラウザは CSP の frame-ancestors）
  'X-Frame-Options': 'DENY',
  // カメラ（物体認識）とマイク（音声入力）はこのサイトの中だけ。ほかの機能は使わない
  'Permissions-Policy':
    'camera=(self), microphone=(self), geolocation=(), payment=(), usb=(), browsing-topics=()',
  // ほかのサイトから開かれたウィンドウと分ける（Clerk のポップアップは使えるようにしておく）
  'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
}

function isLocal(url: URL) {
  return url.hostname === 'localhost' || url.hostname === '127.0.0.1'
}

/** 管理画面とログイン画面（検索に載せず、キャッシュもさせない） */
function isPrivatePath(pathname: string) {
  return (
    pathname === '/admin' ||
    pathname.startsWith('/admin/') ||
    pathname.startsWith('/sign-in')
  )
}

/** レスポンスにセキュリティ関連のヘッダーを付ける */
export const securityHeadersMiddleware = createMiddleware({
  type: 'request',
}).server(async ({ request, next }) => {
  const result = await next()
  const url = new URL(request.url)

  const headers: Record<string, string> = {
    ...commonHeaders,
    'Content-Security-Policy': [
      ...csp,
      // http の localhost で付けると、開発中に画像や CSS が読めなくなる
      ...(isLocal(url) ? [] : ['upgrade-insecure-requests']),
    ].join('; '),
  }
  if (!isLocal(url)) {
    // 一度来たブラウザには、1 年間 https でしか接続させない
    headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'
  }
  if (isPrivatePath(url.pathname)) {
    headers['X-Robots-Tag'] = 'noindex, nofollow'
    headers['Cache-Control'] = 'no-store'
  }

  let response = result.response
  try {
    for (const [name, value] of Object.entries(headers)) {
      // 画像の配信などで、ルート側が先に付けたものはそちらを優先する
      if (!response.headers.has(name)) response.headers.set(name, value)
    }
  } catch {
    // ヘッダーを書き換えられないレスポンス（fetch の結果をそのまま返すときなど）は作り直す
    response = new Response(response.body, response)
    for (const [name, value] of Object.entries(headers)) {
      if (!response.headers.has(name)) response.headers.set(name, value)
    }
  }
  return { ...result, response }
})
