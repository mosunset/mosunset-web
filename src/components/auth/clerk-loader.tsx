import * as React from 'react'

/**
 * Clerk の枠（clerk-root.tsx）を、要るときだけ読み込む。
 * サーバーではルートの loader で、ブラウザでは画面を引き継ぐ前（src/client.tsx）とページを移るときに
 * preloadClerk() で読んでおくので、ふつうは読み込み済みの部品をそのまま描く
 */

type ClerkRootComponent = typeof import('@/components/auth/clerk-root').default

let loaded: ClerkRootComponent | undefined
let loading: Promise<{ default: ClerkRootComponent }> | undefined

export function preloadClerk() {
  loading ??= import('@/components/auth/clerk-root').then((m) => {
    loaded = m.default
    return m
  })
  return loading
}

const LazyClerkRoot = React.lazy(preloadClerk)

/**
 * Clerk の枠。サーバーとブラウザで形がそろうよう、いつも Suspense で包む
 * （読み込み済みならその場で描き、まだなら読み込みを待つ）
 */
export function ClerkRoot(props: {
  nonce?: string
  children: React.ReactNode
}) {
  const Loaded = loaded
  return (
    <React.Suspense fallback={null}>
      {Loaded ? <Loaded {...props} /> : <LazyClerkRoot {...props} />}
    </React.Suspense>
  )
}
