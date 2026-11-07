import { clerkMiddleware } from '@clerk/tanstack-react-start/server'
import {
  createCsrfMiddleware,
  createMiddleware,
  createStart,
} from '@tanstack/react-start'

import { createNonce, withSecurityHeaders } from '@/server/security-headers'

// このファイルはブラウザ用のバンドルにも入る。src/server のものは .server() の中だけで使う
// （ブラウザ用では .server() の中身ごと消えるので、src/server の import も残らない）

/**
 * レスポンスにセキュリティ関連のヘッダーを付ける（中身は src/server/security-headers.ts）。
 * nonce は context.cspNonce としてルーター（src/router.tsx）に渡し、ページに出すスクリプトに付けてもらう
 */
const securityHeadersMiddleware = createMiddleware({ type: 'request' }).server(
  async ({ request, next }) => {
    const nonce = createNonce()
    const result = await next({ context: { cspNonce: nonce } })
    return {
      ...result,
      response: withSecurityHeaders(request, result.response, nonce),
    }
  },
)

// start.ts を置くと既定の CSRF 対策が外れるので、server function 用に自分で入れる
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === 'serverFn',
})

export const startInstance = createStart(() => ({
  requestMiddleware: [
    securityHeadersMiddleware,
    csrfMiddleware,
    clerkMiddleware(),
  ],
}))
