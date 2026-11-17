import { createRouter as createTanStackRouter } from '@tanstack/react-router'
import { getGlobalStartContext } from '@tanstack/react-start'
import { installSharedTransitions } from '@/lib/view-transition'
import { routeTree } from './routeTree.gen'

/**
 * CSP の nonce。サーバーではリクエストごとに src/start.ts のミドルウェアが作ったもの、
 * ブラウザではページの <meta property="csp-nonce">（src/routes/__root.tsx）に入っているものを使う
 */
function getCspNonce() {
  if (typeof document === 'undefined') {
    const context = getGlobalStartContext() as { cspNonce?: string } | undefined
    return context?.cspNonce
  }
  // ブラウザは nonce 属性の値を隠すので、プロパティから読む
  return (
    document.querySelector<HTMLMetaElement>('meta[property="csp-nonce"]')
      ?.nonce || undefined
  )
}

export function getRouter() {
  const router = createTanStackRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
    ssr: { nonce: getCspNonce() },
    // ページを移るときに View Transitions で軽く入れ替える（src/lib/view-transition.ts）。
    // 一覧の絞り込み・並べ替え（URL の ? のあとだけが変わる）と、ページの中の # への移動では動かさない
    defaultViewTransition: {
      types: ({ pathChanged }) => (pathChanged ? ['page'] : false),
    },
  })

  installSharedTransitions(router)

  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
