// サーバー側の処理からだけ使う

/** Cloudflare が公開しているテスト用のシークレット（常に成功する）。開発時だけ使う */
const TEST_SECRET = '1x0000000000000000000000000000000AA'

function getSecret() {
  const secret = process.env.TURNSTILE_SECRET_KEY
  if (secret) return secret
  if (import.meta.env.DEV) return TEST_SECRET
  return null
}

/** Turnstile のトークンを検証する */
export async function verifyTurnstile(token: string, remoteIp?: string) {
  const secret = getSecret()
  if (!secret) {
    console.error('TURNSTILE_SECRET_KEY が設定されていません')
    return false
  }

  const body = new FormData()
  body.set('secret', secret)
  body.set('response', token)
  if (remoteIp) body.set('remoteip', remoteIp)

  const res = await fetch(
    'https://challenges.cloudflare.com/turnstile/v0/siteverify',
    { method: 'POST', body },
  )
  if (!res.ok) return false
  const result = (await res.json()) as { success: boolean }
  return result.success
}
