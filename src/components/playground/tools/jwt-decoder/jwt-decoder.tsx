import {
  CircleAlert,
  CircleCheck,
  CircleX,
  Clock,
  KeyRound,
  Loader2,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react'
import type * as React from 'react'
import { useEffect, useMemo, useState } from 'react'

import { CopyButton } from '@/components/playground/parts'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

/* ---------- 色（header・payload・signature で分ける） ---------- */

const partColor = {
  header: 'text-rose-600 dark:text-rose-400',
  payload: 'text-violet-600 dark:text-violet-400',
  signature: 'text-sky-600 dark:text-sky-400',
} as const

/* ---------- base64url ---------- */

function b64urlToBytes(s: string) {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) {
    throw new Error('base64url で使えない文字が入っています')
  }
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

function bytesToB64url(bytes: Uint8Array) {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const utf8 = new TextEncoder()

function b64urlJson(value: unknown) {
  return bytesToB64url(utf8.encode(JSON.stringify(value)))
}

/* ---------- JWT を分ける ---------- */

type Part =
  | { ok: true; raw: string; json: unknown; text: string }
  | { ok: false; raw: string; error: string }

type ParsedJwt = {
  header: Part
  payload: Part
  signature: string
  signingInput: string
}

function decodePart(raw: string): Part {
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(
      b64urlToBytes(raw),
    )
    try {
      return { ok: true, raw, json: JSON.parse(text), text }
    } catch {
      return { ok: false, raw, error: `JSON として読めません: ${text}` }
    }
  } catch (e) {
    return {
      ok: false,
      raw,
      error: e instanceof Error ? e.message : 'デコードできません',
    }
  }
}

/** 前後の空白・改行と、先頭の「Bearer 」を取り除く */
function cleanToken(input: string) {
  return input.replace(/\s+/g, '').replace(/^Bearer/i, '')
}

function parseJwt(token: string): ParsedJwt | { error: string } | null {
  if (!token) return null
  const parts = token.split('.')
  if (parts.length === 5) {
    return {
      error:
        '5 つに分かれているので、暗号化された JWT（JWE）のようです。JWE は鍵がないと中身を読めないため、このツールでは扱えません。',
    }
  }
  if (parts.length !== 3) {
    return {
      error: `JWT は「.」で 3 つに分かれた形（ヘッダー.ペイロード.署名）です。いまは ${parts.length} つに分かれています。`,
    }
  }
  const [h, p, s] = parts
  return {
    header: decodePart(h),
    payload: decodePart(p),
    signature: s,
    signingInput: `${h}.${p}`,
  }
}

/* ---------- 署名のアルゴリズム ---------- */

type AlgInfo =
  | { kind: 'hmac'; hash: string }
  | { kind: 'rsa'; hash: string }
  | { kind: 'pss'; hash: string; saltLength: number }
  | { kind: 'ec'; hash: string; namedCurve: string }
  | { kind: 'ed' }

function algInfo(alg: unknown): AlgInfo | null {
  if (typeof alg !== 'string') return null
  const m = alg.match(/^(HS|RS|PS|ES)(256|384|512)$/)
  if (m) {
    const bits = Number(m[2])
    const hash = `SHA-${bits}`
    switch (m[1]) {
      case 'HS':
        return { kind: 'hmac', hash }
      case 'RS':
        return { kind: 'rsa', hash }
      case 'PS':
        return { kind: 'pss', hash, saltLength: bits / 8 }
      case 'ES':
        return {
          kind: 'ec',
          hash,
          namedCurve: bits === 512 ? 'P-521' : `P-${bits}`,
        }
    }
  }
  if (alg === 'EdDSA' || alg === 'Ed25519') return { kind: 'ed' }
  return null
}

function importAlgorithm(info: AlgInfo) {
  switch (info.kind) {
    case 'hmac':
      return { name: 'HMAC', hash: info.hash }
    case 'rsa':
      return { name: 'RSASSA-PKCS1-v1_5', hash: info.hash }
    case 'pss':
      return { name: 'RSA-PSS', hash: info.hash }
    case 'ec':
      return { name: 'ECDSA', namedCurve: info.namedCurve }
    case 'ed':
      return { name: 'Ed25519' }
  }
}

function verifyAlgorithm(info: AlgInfo) {
  switch (info.kind) {
    case 'hmac':
      return { name: 'HMAC' }
    case 'rsa':
      return { name: 'RSASSA-PKCS1-v1_5' }
    case 'pss':
      return { name: 'RSA-PSS', saltLength: info.saltLength }
    case 'ec':
      return { name: 'ECDSA', hash: info.hash }
    case 'ed':
      return { name: 'Ed25519' }
  }
}

/** 画面に出すための、ユーザー向けのエラー */
class KeyError extends Error {}

/* ---------- 鍵を読み込む ---------- */

/** DER の TLV を 1 つ読む */
function readTlv(der: Uint8Array, offset: number) {
  const tag = der[offset]
  let len = der[offset + 1]
  let start = offset + 2
  if (len & 0x80) {
    const n = len & 0x7f
    len = 0
    for (let i = 0; i < n; i++) len = len * 256 + der[start + i]
    start += n
  }
  if (tag === undefined || start + len > der.length) {
    throw new KeyError('証明書の形式を読めませんでした')
  }
  return { tag, start, end: start + len }
}

/** X.509 証明書（DER）から公開鍵（SubjectPublicKeyInfo）を取り出す */
function spkiFromCertificate(der: Uint8Array) {
  const cert = readTlv(der, 0)
  const tbs = readTlv(der, cert.start)
  let pos = tbs.start
  let field = readTlv(der, pos)
  // version（[0]）は省略されることがある
  if (field.tag === 0xa0) {
    pos = field.end
    field = readTlv(der, pos)
  }
  // serialNumber, signature, issuer, validity, subject の次が公開鍵
  for (let i = 0; i < 5; i++) {
    pos = field.end
    field = readTlv(der, pos)
  }
  return der.slice(pos, field.end)
}

function pemToSpki(pem: string) {
  const m = pem.match(/-----BEGIN ([A-Z0-9 ]+)-----([\s\S]*?)-----END \1-----/)
  if (!m) {
    throw new KeyError(
      '鍵の形式がわかりません。「-----BEGIN PUBLIC KEY-----」で始まる PEM か、JWK（JSON）を入れてください。',
    )
  }
  const label = m[1]
  if (label.includes('PRIVATE')) {
    throw new KeyError(
      '秘密鍵が入っています。検証に使うのは公開鍵です。秘密鍵はむやみに貼らないでください。',
    )
  }
  let der: Uint8Array
  try {
    der = Uint8Array.from(atob(m[2].replace(/\s+/g, '')), (c) =>
      c.charCodeAt(0),
    )
  } catch {
    throw new KeyError('PEM の中身（base64）が壊れています')
  }
  if (label === 'PUBLIC KEY') return der
  if (label === 'CERTIFICATE') return spkiFromCertificate(der)
  if (label === 'RSA PUBLIC KEY') {
    throw new KeyError(
      '「BEGIN RSA PUBLIC KEY」（PKCS#1）の形は読めません。openssl rsa -RSAPublicKey_in -pubout で「BEGIN PUBLIC KEY」の形に変えてから入れてください。',
    )
  }
  throw new KeyError(`「${label}」の PEM には対応していません`)
}

type JwkLike = JsonWebKey & { kid?: string; keys?: JwkLike[] }

function pickJwk(text: string, kid: unknown): JsonWebKey {
  let jwk: JwkLike
  try {
    jwk = JSON.parse(text)
  } catch {
    throw new KeyError('JWK を JSON として読めません')
  }
  // JWKS（{ "keys": [...] }）なら、kid が同じ鍵を使う
  if (Array.isArray(jwk.keys)) {
    const found = jwk.keys.find((k) => k.kid === kid) ?? jwk.keys[0]
    if (!found) throw new KeyError('JWKS に鍵が入っていません')
    jwk = found
  }
  // 秘密鍵の JWK でも、公開鍵の部分だけを使う
  const { d, p, q, dp, dq, qi, key_ops, alg, use, ...pub } = jwk
  return jwk.kty === 'oct' ? { kty: 'oct', k: jwk.k } : pub
}

type SecretEncoding = 'utf8' | 'base64'

async function importVerifyKey(
  info: AlgInfo,
  keyText: string,
  encoding: SecretEncoding,
  kid: unknown,
) {
  const text = keyText.trim()
  const algorithm = importAlgorithm(info)
  if (info.kind === 'hmac') {
    let raw: Uint8Array
    if (text.startsWith('{')) {
      return crypto.subtle.importKey(
        'jwk',
        pickJwk(text, kid),
        algorithm,
        false,
        ['verify'],
      )
    }
    if (encoding === 'base64') {
      try {
        raw = b64urlToBytes(
          text.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
        )
      } catch {
        throw new KeyError('秘密鍵を base64 として読めません')
      }
    } else {
      raw = utf8.encode(keyText)
    }
    return crypto.subtle.importKey(
      'raw',
      raw as BufferSource,
      algorithm,
      false,
      ['verify'],
    )
  }
  if (text.startsWith('{')) {
    return crypto.subtle.importKey(
      'jwk',
      pickJwk(text, kid),
      algorithm,
      false,
      ['verify'],
    )
  }
  return crypto.subtle.importKey(
    'spki',
    pemToSpki(text) as BufferSource,
    algorithm,
    false,
    ['verify'],
  )
}

async function verifyJwt(
  jwt: ParsedJwt,
  keyText: string,
  encoding: SecretEncoding,
) {
  if (!jwt.header.ok) throw new KeyError('ヘッダーが読めないので検証できません')
  const header = jwt.header.json as Record<string, unknown>
  const info = algInfo(header.alg)
  if (!info) {
    throw new KeyError(
      header.alg === 'none'
        ? '「alg: none」は署名なしのトークンです。検証するものがありません。'
        : `アルゴリズム「${String(header.alg)}」には対応していません`,
    )
  }
  let signature: Uint8Array
  try {
    signature = b64urlToBytes(jwt.signature)
  } catch {
    throw new KeyError('署名の部分が base64url として読めません')
  }
  let key: CryptoKey
  try {
    key = await importVerifyKey(info, keyText, encoding, header.kid)
  } catch (e) {
    if (e instanceof KeyError) throw e
    throw new KeyError(
      `鍵を読み込めませんでした。${String(header.alg)} に合う鍵か確かめてください。`,
    )
  }
  return crypto.subtle.verify(
    verifyAlgorithm(info),
    key,
    signature as BufferSource,
    utf8.encode(jwt.signingInput),
  )
}

async function signHs(alg: HsAlg, payload: unknown, secret: string) {
  const info = algInfo(alg)
  if (!info || info.kind !== 'hmac') throw new Error(alg)
  const key = await crypto.subtle.importKey(
    'raw',
    utf8.encode(secret),
    importAlgorithm(info),
    false,
    ['sign'],
  )
  const input = `${b64urlJson({ alg, typ: 'JWT' })}.${b64urlJson(payload)}`
  const sig = await crypto.subtle.sign('HMAC', key, utf8.encode(input))
  return `${input}.${bytesToB64url(new Uint8Array(sig))}`
}

/* ---------- 日時 ---------- */

const timeClaims = new Set(['exp', 'iat', 'nbf', 'auth_time', 'updated_at'])

function formatDate(ms: number, timeZone?: string) {
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone,
    timeZoneName: 'short',
  }).format(ms)
}

function formatDuration(ms: number) {
  let s = Math.floor(Math.abs(ms) / 1000)
  const d = Math.floor(s / 86400)
  s -= d * 86400
  const h = Math.floor(s / 3600)
  s -= h * 3600
  const m = Math.floor(s / 60)
  s -= m * 60
  if (d) return `${d.toLocaleString('ja-JP')} 日 ${h} 時間`
  if (h) return `${h} 時間 ${m} 分`
  if (m) return `${m} 分 ${s} 秒`
  return `${s} 秒`
}

function relative(ms: number, now: number) {
  return ms >= now
    ? `${formatDuration(ms - now)}後`
    : `${formatDuration(now - ms)}前`
}

/** 1 秒ごとに今の時刻を返す */
function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    setNow(Date.now())
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [active])
  return now
}

/* ---------- クレームの説明 ---------- */

const headerDescriptions: Record<string, string> = {
  alg: '署名のアルゴリズム',
  typ: 'トークンの種類（ふつうは JWT）',
  kid: '署名に使った鍵の ID。公開鍵の一覧（JWKS）から鍵を選ぶのに使う',
  cty: '中身の種類',
  jku: '公開鍵の一覧（JWKS）の URL',
  x5u: '証明書の URL',
  x5c: '証明書チェーン',
  x5t: '証明書の SHA-1 サムプリント',
  'x5t#S256': '証明書の SHA-256 サムプリント',
  crit: '必ず理解しないといけない拡張ヘッダーの一覧',
}

const payloadDescriptions: Record<string, string> = {
  iss: '発行者。このトークンを発行したサービス',
  sub: '主体。だれについてのトークンか（ユーザー ID など）',
  aud: '受け取り手。このトークンを使ってよいサービス',
  exp: '有効期限。この時刻を過ぎたら使えない',
  nbf: '有効になる時刻。この時刻より前は使えない',
  iat: '発行した時刻',
  jti: 'トークンの ID。同じトークンの使い回しを防ぐのに使う',
  azp: 'トークンを受け取ったクライアント（OpenID Connect）',
  auth_time: 'ユーザーがログインした時刻（OpenID Connect）',
  nonce: 'リプレイ攻撃を防ぐための値（OpenID Connect）',
  acr: '認証の強さ（OpenID Connect）',
  amr: '認証の方法（パスワード・多要素認証など）',
  at_hash: 'アクセストークンのハッシュ（OpenID Connect）',
  sid: 'ログインのセッション ID',
  scope: '許可されている操作の範囲',
  scp: '許可されている操作の範囲',
  client_id: 'トークンを要求したクライアントの ID',
  name: '名前',
  given_name: '名',
  family_name: '姓',
  preferred_username: 'ユーザー名',
  email: 'メールアドレス',
  email_verified: 'メールアドレスが確認済みか',
  picture: 'プロフィール画像の URL',
  locale: '言語・地域',
  updated_at: 'プロフィールを更新した時刻',
  roles: 'ロール（役割）',
  groups: '所属するグループ',
}

/* ---------- JSON の色付け ---------- */

function JsonView({ value }: { value: unknown }) {
  const json = JSON.stringify(value, null, 2)
  const nodes: React.ReactNode[] = []
  const re =
    /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g
  let last = 0
  for (const m of json.matchAll(re)) {
    const i = m.index ?? 0
    if (i > last) nodes.push(json.slice(last, i))
    const cls = m[2]
      ? 'text-foreground'
      : m[1]
        ? 'text-emerald-700 dark:text-emerald-400'
        : m[3]
          ? 'text-sky-700 dark:text-sky-400'
          : 'text-amber-700 dark:text-amber-400'
    nodes.push(
      <span key={i} className={cls}>
        {m[1] ?? m[0]}
      </span>,
    )
    if (m[2]) nodes.push(m[2])
    last = i + m[0].length
  }
  nodes.push(json.slice(last))
  return (
    <pre className="overflow-x-auto whitespace-pre-wrap break-all p-3 font-mono text-xs leading-relaxed text-muted-foreground sm:text-sm">
      {nodes}
    </pre>
  )
}

/* ---------- 部品 ---------- */

/** 色分けしたトークン */
function ColoredToken({ token }: { token: string }) {
  const [h, p, ...rest] = token.split('.')
  return (
    <code className="block break-all rounded-lg border bg-muted/30 p-3 font-mono text-xs leading-relaxed sm:text-sm">
      <span className={partColor.header}>{h}</span>
      {p !== undefined && (
        <>
          .<span className={partColor.payload}>{p}</span>
        </>
      )}
      {rest.length > 0 && (
        <>
          .<span className={partColor.signature}>{rest.join('.')}</span>
        </>
      )}
    </code>
  )
}

function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  mono,
}: {
  label: string
  options: readonly { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
  mono?: boolean
}) {
  return (
    <fieldset className="inline-flex rounded-md border p-0.5">
      <legend className="sr-only">{label}</legend>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'rounded px-3 py-1 text-xs text-muted-foreground',
            mono && 'font-mono',
            value === o.value && 'bg-muted text-foreground',
          )}
        >
          {o.label}
        </button>
      ))}
    </fieldset>
  )
}

function PartPanel({
  title,
  color,
  part,
}: {
  title: string
  color: string
  part: Part
}) {
  return (
    <section className="min-w-0 rounded-lg border">
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <h2 className={cn('text-sm font-semibold', color)}>{title}</h2>
        {part.ok && (
          <CopyButton
            value={JSON.stringify(part.json, null, 2)}
            size="icon"
            label={`${title} の JSON をコピー`}
          />
        )}
      </div>
      {part.ok ? (
        <JsonView value={part.json} />
      ) : (
        <p className="p-3 text-sm break-all text-destructive">{part.error}</p>
      )}
    </section>
  )
}

function ClaimValue({
  name,
  value,
  now,
}: {
  name: string
  value: unknown
  now: number
}) {
  if (
    timeClaims.has(name) &&
    typeof value === 'number' &&
    Number.isFinite(value)
  ) {
    const ms = value * 1000
    return (
      <div className="space-y-0.5">
        <div className="font-mono text-xs text-muted-foreground">{value}</div>
        <div>{formatDate(ms)}</div>
        <div className="text-xs text-muted-foreground">
          {formatDate(ms, 'UTC')}・{relative(ms, now)}
        </div>
        {value > 1e11 && (
          <div className="text-xs text-amber-700 dark:text-amber-400">
            値が大きすぎます。秒ではなくミリ秒で入っているかもしれません。
          </div>
        )}
      </div>
    )
  }
  return (
    <code className="font-mono text-xs break-all sm:text-sm">
      {typeof value === 'string' ? value : JSON.stringify(value)}
    </code>
  )
}

function ClaimTable({
  title,
  json,
  descriptions,
  now,
}: {
  title: string
  json: unknown
  descriptions: Record<string, string>
  now: number
}) {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return null
  const entries = Object.entries(json)
  if (entries.length === 0) return null
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold">{title}</h2>
      <ul className="divide-y rounded-lg border">
        {entries.map(([k, v]) => (
          <li
            key={k}
            className="grid gap-1 p-3 sm:grid-cols-[8rem_1fr] sm:gap-3"
          >
            <div>
              <div className="font-mono text-sm font-medium break-all">{k}</div>
              {descriptions[k] && (
                <div className="text-xs text-muted-foreground">
                  {descriptions[k]}
                </div>
              )}
            </div>
            <div className="min-w-0 text-sm">
              <ClaimValue name={k} value={v} now={now} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** 有効期限などの状態 */
function TimeStatus({
  payload,
  now,
}: {
  payload: Record<string, unknown>
  now: number
}) {
  const exp = typeof payload.exp === 'number' ? payload.exp * 1000 : null
  const nbf = typeof payload.nbf === 'number' ? payload.nbf * 1000 : null

  let tone: 'ok' | 'bad' | 'warn' | 'none'
  let text: string
  if (exp !== null && now >= exp) {
    tone = 'bad'
    text = `期限切れです（${formatDuration(now - exp)}前に切れました）`
  } else if (nbf !== null && now < nbf) {
    tone = 'warn'
    text = `まだ使えません（あと ${formatDuration(nbf - now)}で有効になります）`
  } else if (exp !== null) {
    tone = 'ok'
    text = `有効期限内です（あと ${formatDuration(exp - now)}）`
  } else {
    tone = 'none'
    text = '有効期限（exp）がありません'
  }

  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-lg border px-3 py-2 text-sm',
        tone === 'ok' &&
          'border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300',
        tone === 'bad' &&
          'border-destructive/40 bg-destructive/10 text-destructive',
        tone === 'warn' &&
          'border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300',
        tone === 'none' && 'text-muted-foreground',
      )}
    >
      <Clock className="size-4 shrink-0" />
      <span className="tabular-nums">{text}</span>
    </div>
  )
}

/* ---------- 読む ---------- */

type VerifyState =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'valid' }
  | { state: 'invalid' }
  | { state: 'error'; message: string }

function Decoder({
  input,
  setInput,
  keyText,
  setKeyText,
  encoding,
  setEncoding,
  onSample,
}: {
  input: string
  setInput: (v: string) => void
  keyText: string
  setKeyText: (v: string) => void
  encoding: SecretEncoding
  setEncoding: (v: SecretEncoding) => void
  onSample: () => void
}) {
  const token = cleanToken(input)
  const parsed = useMemo(() => parseJwt(token), [token])
  const jwt = parsed && 'header' in parsed ? parsed : null
  const now = useNow(jwt !== null)

  const header =
    jwt?.header.ok && jwt.header.json && typeof jwt.header.json === 'object'
      ? (jwt.header.json as Record<string, unknown>)
      : null
  const payload =
    jwt?.payload.ok && jwt.payload.json && typeof jwt.payload.json === 'object'
      ? (jwt.payload.json as Record<string, unknown>)
      : null
  const info = algInfo(header?.alg)

  const [verify, setVerify] = useState<VerifyState>({ state: 'idle' })
  useEffect(() => {
    if (!jwt || !keyText.trim()) {
      setVerify({ state: 'idle' })
      return
    }
    let cancelled = false
    setVerify({ state: 'checking' })
    verifyJwt(jwt, keyText, encoding).then(
      (ok) => {
        if (!cancelled) setVerify({ state: ok ? 'valid' : 'invalid' })
      },
      (e) => {
        if (cancelled) return
        setVerify({
          state: 'error',
          message:
            e instanceof KeyError
              ? e.message
              : 'このブラウザでは検証できませんでした',
        })
      },
    )
    return () => {
      cancelled = true
    }
  }, [jwt, keyText, encoding])

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="eyJhbGciOi… の形の JWT を貼り付けてください（先頭の Bearer は付いたままでも大丈夫です）"
          rows={5}
          className="font-mono break-all"
          spellCheck={false}
          autoComplete="off"
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onSample}>
            <Sparkles />
            サンプルを入れる
          </Button>
          {input && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setInput('')}
            >
              <X />
              消す
            </Button>
          )}
        </div>
      </div>

      {parsed && 'error' in parsed && (
        <p className="flex gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          <CircleAlert className="mt-0.5 size-4 shrink-0" />
          {parsed.error}
        </p>
      )}

      {jwt && (
        <>
          <div className="space-y-2">
            <ColoredToken token={token} />
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
              <span className={partColor.header}>■ ヘッダー</span>
              <span className={partColor.payload}>■ ペイロード</span>
              <span className={partColor.signature}>■ 署名</span>
            </div>
          </div>

          {payload && <TimeStatus payload={payload} now={now} />}

          <div className="grid gap-4 md:grid-cols-2">
            <PartPanel
              title="ヘッダー"
              color={partColor.header}
              part={jwt.header}
            />
            <PartPanel
              title="ペイロード"
              color={partColor.payload}
              part={jwt.payload}
            />
          </div>

          {payload && (
            <ClaimTable
              title="ペイロードの中身"
              json={payload}
              descriptions={payloadDescriptions}
              now={now}
            />
          )}
          {header && (
            <ClaimTable
              title="ヘッダーの中身"
              json={header}
              descriptions={headerDescriptions}
              now={now}
            />
          )}

          <section className="space-y-3 rounded-lg border p-3 sm:p-4">
            <div className="space-y-1">
              <h2
                className={cn(
                  'flex items-center gap-2 text-sm font-semibold',
                  partColor.signature,
                )}
              >
                <KeyRound className="size-4" />
                署名
              </h2>
              <code className="block font-mono text-xs break-all text-muted-foreground">
                {jwt.signature || '（署名がありません）'}
              </code>
            </div>

            {header?.alg === 'none' ? (
              <p className="flex gap-2 text-sm text-amber-800 dark:text-amber-300">
                <CircleAlert className="mt-0.5 size-4 shrink-0" />
                「alg:
                none」は署名のないトークンです。だれでも作れるので、中身を信用してはいけません。
              </p>
            ) : (
              <div className="space-y-2">
                <div className="text-sm">
                  署名を検証する（任意）
                  <span className="ml-2 font-mono text-xs text-muted-foreground">
                    {String(header?.alg ?? '?')}
                  </span>
                </div>
                <Textarea
                  value={keyText}
                  onChange={(e) => setKeyText(e.target.value)}
                  placeholder={
                    info?.kind === 'hmac'
                      ? '署名に使った秘密鍵（共有の鍵）'
                      : '公開鍵（-----BEGIN PUBLIC KEY----- で始まる PEM・証明書、または JWK / JWKS）'
                  }
                  rows={info?.kind === 'hmac' ? 2 : 5}
                  className="font-mono text-xs"
                  spellCheck={false}
                  autoComplete="off"
                />
                {info?.kind === 'hmac' && (
                  <Segmented
                    label="秘密鍵の形式"
                    value={encoding}
                    onChange={setEncoding}
                    options={[
                      { value: 'utf8', label: '文字列そのまま' },
                      { value: 'base64', label: 'base64 で書いた鍵' },
                    ]}
                  />
                )}
                <VerifyResult verify={verify} />
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}

function VerifyResult({ verify }: { verify: VerifyState }) {
  switch (verify.state) {
    case 'idle':
      return (
        <p className="text-xs text-muted-foreground">
          鍵を入れると、その場で署名が正しいかを確かめます。HS256/384/512
          は秘密鍵、RS・PS・ES・EdDSA は公開鍵を使います。
        </p>
      )
    case 'checking':
      return (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          確かめています…
        </p>
      )
    case 'valid':
      return (
        <p className="flex items-center gap-2 font-medium text-emerald-700 text-sm dark:text-emerald-400">
          <CircleCheck className="size-4" />
          署名は正しいです（この鍵で署名されています）
        </p>
      )
    case 'invalid':
      return (
        <p className="flex items-center gap-2 font-medium text-destructive text-sm">
          <CircleX className="size-4" />
          署名が合いません（鍵が違うか、トークンが書き換えられています）
        </p>
      )
    case 'error':
      return (
        <p className="flex gap-2 text-sm text-amber-800 dark:text-amber-300">
          <CircleAlert className="mt-0.5 size-4 shrink-0" />
          {verify.message}
        </p>
      )
  }
}

/* ---------- 作る ---------- */

type HsAlg = 'HS256' | 'HS384' | 'HS512'

function randomSecret() {
  return bytesToB64url(crypto.getRandomValues(new Uint8Array(64)))
}

function samplePayload() {
  const now = Math.floor(Date.now() / 1000)
  return {
    sub: '1234567890',
    name: 'Mosunset Taro',
    iss: 'https://example.com',
    iat: now,
    exp: now + 60 * 60,
  }
}

function Encoder({
  onOpen,
}: {
  onOpen: (token: string, secret: string) => void
}) {
  const [alg, setAlg] = useState<HsAlg>('HS256')
  const [payloadText, setPayloadText] = useState(() =>
    JSON.stringify(samplePayload(), null, 2),
  )
  const [secret, setSecret] = useState(randomSecret)
  const [token, setToken] = useState('')

  const payload = useMemo(() => {
    try {
      return { ok: true as const, value: JSON.parse(payloadText) as unknown }
    } catch (e) {
      return {
        ok: false as const,
        error: e instanceof Error ? e.message : 'JSON が読めません',
      }
    }
  }, [payloadText])

  useEffect(() => {
    if (!payload.ok || !secret) {
      setToken('')
      return
    }
    let cancelled = false
    signHs(alg, payload.value, secret).then(
      (t) => !cancelled && setToken(t),
      () => !cancelled && setToken(''),
    )
    return () => {
      cancelled = true
    }
  }, [alg, payload, secret])

  /** ペイロードの時刻を書き換える */
  const setTime = (key: 'iat' | 'exp', offsetSec: number) => {
    if (!payload.ok || typeof payload.value !== 'object' || !payload.value)
      return
    const next = {
      ...(payload.value as Record<string, unknown>),
      [key]: Math.floor(Date.now() / 1000) + offsetSec,
    }
    setPayloadText(JSON.stringify(next, null, 2))
  }

  const secretBytes = utf8.encode(secret).length
  const minBytes = Number(alg.slice(2)) / 8

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className={cn('text-sm font-semibold', partColor.header)}>
            ヘッダー
          </h2>
          <Segmented
            label="署名のアルゴリズム"
            value={alg}
            onChange={setAlg}
            mono
            options={[
              { value: 'HS256', label: 'HS256' },
              { value: 'HS384', label: 'HS384' },
              { value: 'HS512', label: 'HS512' },
            ]}
          />
        </div>
        <code className="block rounded-lg border bg-muted/30 p-3 font-mono text-xs sm:text-sm">
          {JSON.stringify({ alg, typ: 'JWT' })}
        </code>
      </div>

      <div className="space-y-2">
        <h2 className={cn('text-sm font-semibold', partColor.payload)}>
          ペイロード（JSON）
        </h2>
        <Textarea
          value={payloadText}
          onChange={(e) => setPayloadText(e.target.value)}
          rows={8}
          className="font-mono text-xs sm:text-sm"
          spellCheck={false}
          aria-invalid={!payload.ok}
        />
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setTime('iat', 0)}
          >
            iat を今に
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setTime('exp', 60 * 60)}
          >
            exp を 1 時間後に
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setTime('exp', 60 * 60 * 24)}
          >
            exp を 1 日後に
          </Button>
        </div>
        {!payload.ok && (
          <p className="text-sm text-destructive">
            JSON として読めません: {payload.error}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <label
          htmlFor="jwt-secret"
          className={cn('text-sm font-semibold', partColor.signature)}
        >
          秘密鍵
        </label>
        <div className="flex gap-2">
          <Input
            id="jwt-secret"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            className="font-mono"
            spellCheck={false}
            autoComplete="off"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setSecret(randomSecret())}
          >
            作り直す
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          文字列をそのまま鍵に使います（{secretBytes} バイト）。{alg} なら{' '}
          {minBytes} バイト以上がおすすめです。
          {secretBytes < minBytes && secret && (
            <span className="text-amber-700 dark:text-amber-400">
              {' '}
              いまの鍵は短すぎます。
            </span>
          )}
        </p>
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold">できた JWT</h2>
        {token ? (
          <>
            <ColoredToken token={token} />
            <div className="flex flex-wrap gap-2">
              <CopyButton value={token} label="JWT をコピー" />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onOpen(token, secret)}
              >
                この JWT を読む
              </Button>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            {secret
              ? 'ペイロードを JSON で入れてください'
              : '秘密鍵を入れてください'}
          </p>
        )}
      </div>
    </div>
  )
}

/* ---------- 本体 ---------- */

type Mode = 'decode' | 'encode'

export function JwtDecoder() {
  const [mode, setMode] = useState<Mode>('decode')
  const [input, setInput] = useState('')
  const [keyText, setKeyText] = useState('')
  const [encoding, setEncoding] = useState<SecretEncoding>('utf8')

  const open = (token: string, secret: string) => {
    setInput(token)
    setKeyText(secret)
    setEncoding('utf8')
    setMode('decode')
  }

  const sample = async () => {
    const secret = 'mosunset-sample-secret-key-0123456789'
    open(await signHs('HS256', samplePayload(), secret), secret)
  }

  return (
    <div className="space-y-6">
      <div className="flex gap-3 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-900 sm:p-4 dark:text-emerald-200">
        <ShieldCheck className="mt-0.5 size-5 shrink-0" />
        <div className="space-y-1">
          <p className="font-semibold">トークンや鍵はサーバーに送りません</p>
          <p className="text-xs leading-relaxed sm:text-sm">
            デコードも署名の検証も JWT
            を作るのも、すべてこのブラウザの中で行います。それでも本番のトークンは、ログインできてしまう「合い鍵」と同じです。画面共有やスクリーンショットに写らないよう気をつけ、使い終わったら消してください。
          </p>
        </div>
      </div>

      <Segmented
        label="使い方"
        value={mode}
        onChange={setMode}
        options={[
          { value: 'decode', label: 'JWT を読む' },
          { value: 'encode', label: 'JWT を作る' },
        ]}
      />

      {mode === 'decode' ? (
        <Decoder
          input={input}
          setInput={setInput}
          keyText={keyText}
          setKeyText={setKeyText}
          encoding={encoding}
          setEncoding={setEncoding}
          onSample={sample}
        />
      ) : (
        <Encoder onOpen={open} />
      )}
    </div>
  )
}
