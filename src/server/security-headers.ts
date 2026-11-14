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

/** Clerk の公開キー（pk_live_<base64("clerk.mosunset.com$")>）から、Clerk の API のホストを取り出す */
function clerkFrontendOrigin() {
  const key = process.env.CLERK_PUBLISHABLE_KEY ?? ''
  try {
    const host = atob(key.replace(/^pk_(live|test)_/, '')).replace(/\$$/, '')
    return /^[a-z0-9.-]+$/.test(host) ? `https://${host}` : null
  } catch {
    return null
  }
}

/** Turnstile（お問い合わせと、Clerk のロボット対策の両方で使う） */
const TURNSTILE = 'https://challenges.cloudflare.com'

/**
 * Content-Security-Policy。
 * スクリプトは、サーバーがリクエストごとに作る nonce が付いたものと、そこから読み込まれたもの（strict-dynamic）だけ動かせる。
 * 外部から読み込むもの: Clerk（ログイン）、Turnstile、物体認識のモデル（storage.googleapis.com）、
 * 文字起こしのモデル（Hugging Face）と ONNX Runtime（cdn.jsdelivr.net）
 */
function contentSecurityPolicy(nonce: string, local: boolean) {
  const clerk = clerkFrontendOrigin()
  return [
    "default-src 'self'",
    // https: と 'unsafe-inline' は、strict-dynamic に対応していない古いブラウザ向け（新しいブラウザは無視する）
    // 'wasm-unsafe-eval' は WebAssembly を動かすため（背景除去・顔のぼかしの MediaPipe。JavaScript の eval は許さない）
    `script-src 'nonce-${nonce}' 'strict-dynamic' https: 'unsafe-inline' 'wasm-unsafe-eval'`,
    // Tailwind や Clerk が style 属性・<style> を使う
    "style-src 'self' 'unsafe-inline'",
    // 本文には https の外部画像も置ける。ファイルを選んだときのプレビューは blob: / data:
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    `connect-src 'self' ${[
      clerk,
      // Clerk の不正利用対策（いくつかのポートを試すので :* が要る）と、利用状況の送信
      'https://*.client.protect.clerk.com:*',
      'https://clerk-telemetry.com',
      TURNSTILE,
      'https://storage.googleapis.com',
      // 文字起こし（Whisper）のモデル（huggingface.co から *.hf.co などへ転送される）と、ONNX Runtime の wasm
      'https://huggingface.co',
      'https://*.huggingface.co',
      'https://*.hf.co',
      'https://cdn.jsdelivr.net',
    ]
      .filter(Boolean)
      .join(' ')}`,
    `frame-src ${TURNSTILE}`,
    "worker-src 'self' blob:",
    "media-src 'self' blob:",
    "manifest-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    // http の localhost で付けると、確認用のサーバーで画像や CSS が読めなくなる
    ...(local ? [] : ['upgrade-insecure-requests']),
  ].join('; ')
}

/** 開発中（vite dev）は Vite がインラインのスクリプトを入れるので、壊れない指定だけにする */
function devContentSecurityPolicy() {
  return [
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
  ].join('; ')
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

/** 推測できない nonce（16 バイトの乱数を base64 にしたもの） */
export function createNonce() {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return btoa(String.fromCharCode(...bytes))
}

/**
 * レスポンスにセキュリティ関連のヘッダーを付ける（src/start.ts のリクエストのミドルウェアから呼ぶ）。
 * nonce はリクエストごとに createNonce で作り、ページに出すスクリプトにも同じものを付ける
 */
export function withSecurityHeaders(
  request: Request,
  original: Response,
  nonce: string,
) {
  const url = new URL(request.url)
  const local = isLocal(url)

  const headers: Record<string, string> = {
    ...commonHeaders,
    'Content-Security-Policy': import.meta.env.DEV
      ? devContentSecurityPolicy()
      : contentSecurityPolicy(nonce, local),
  }
  if (!local) {
    // 一度来たブラウザには、1 年間 https でしか接続させない
    headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'
  }
  if (isPrivatePath(url.pathname)) {
    headers['X-Robots-Tag'] = 'noindex, nofollow'
    headers['Cache-Control'] = 'no-store'
  }

  let response = original
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
  return response
}
