import { StartClient } from '@tanstack/react-start/client'
import { StrictMode, startTransition } from 'react'
import { hydrateRoot } from 'react-dom/client'

import { preloadClerk } from '@/components/auth/clerk-loader'
import { preloadToolForPath } from '@/components/playground/tool-modules'
import { isClerkPath, readSignedInHint } from '@/lib/auth/clerk-hint'

/**
 * ブラウザ側の入口（TanStack Start の既定の入口と同じ。src/client.tsx を置くとこちらが使われる）。
 * プレイグラウンドのツールのページでは、サーバーで描いたツールの JS を読み込んでから、
 * サーバーの表示を引き継ぐ（ハイドレーション）。間に合わないと React がサーバーの表示を捨てて
 * 「読み込み中」の枠を出し直し、表示がずれる（CLS）ため。
 * Clerk（ログイン）を使うページ（管理画面・ログイン・ログイン中）でも、同じ理由で Clerk の部品を先に読み込む
 */
function hydrate() {
  startTransition(() => {
    hydrateRoot(
      document,
      <StrictMode>
        <StartClient />
      </StrictMode>,
    )
  })
}

const path = window.location.pathname
Promise.all([
  preloadToolForPath(path),
  isClerkPath(path) || readSignedInHint() ? preloadClerk() : undefined,
])
  .catch(() => {})
  .finally(hydrate)
