import { TanStackDevtools } from '@tanstack/react-devtools'
import {
  type AnyRouteMatch,
  createRootRoute,
  HeadContent,
  rootRouteId,
  ScriptOnce,
  Scripts,
  useRouter,
  useRouterState,
} from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { useEffect } from 'react'
import { ClerkRoot, preloadClerk } from '@/components/auth/clerk-loader'
import { NotFoundPage } from '@/components/common/not-found-page'
import { LazyToaster } from '@/components/layout/lazy-toaster'
import { NavigationProgress } from '@/components/layout/navigation-progress'
import { SiteShell } from '@/components/layout/site-shell'
import { TooltipProvider } from '@/components/ui/tooltip'
import { isClerkPath, readSignedInHint } from '@/lib/auth/clerk-hint'
import { resolveBreadcrumbs } from '@/lib/breadcrumbs'
import {
  absoluteUrl,
  jsonLd,
  normalizePath,
  personId,
  seo,
  websiteId,
} from '@/lib/seo'
import { site } from '@/lib/site'
import {
  themeColors,
  themeInitScript,
  useResolvedTheme,
  watchTheme,
} from '@/lib/theme'

import appCss from '../styles.css?url'

/** パンくず（staticData.breadcrumb）を構造化データにする。2 階層目から出す */
function breadcrumbJsonLd(matches: AnyRouteMatch[]) {
  const crumbs = resolveBreadcrumbs(matches)
  if (crumbs.length <= 1) return []
  return [
    jsonLd({
      '@type': 'BreadcrumbList',
      itemListElement: crumbs.map((c, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: c.label,
        item: absoluteUrl(c.pathname),
      })),
    }),
  ]
}

export const Route = createRootRoute({
  staticData: { breadcrumb: 'ホーム' },
  // サイト共通の head。ページ固有の title / description は各ルートの head で上書きする
  head: ({ matches }) => {
    const leaf = matches.at(-1)
    // どのルートにもマッチしない URL では root しか残らない
    const isGlobalNotFound = !leaf || leaf.routeId === rootRouteId
    const isNotFound =
      isGlobalNotFound || matches.some((m) => m.status === 'notFound')
    const url = absoluteUrl(normalizePath(leaf?.pathname ?? '/'))
    const imageUrl = absoluteUrl(site.image.path)

    return {
      meta: [
        { charSet: 'utf-8' },
        {
          name: 'viewport',
          content: 'width=device-width, initial-scale=1, viewport-fit=cover',
        },
        // ライト・ダークを選んでいるときは、<head> のスクリプト（themeInitScript）が書き換える
        {
          name: 'theme-color',
          media: '(prefers-color-scheme: light)',
          content: themeColors.light,
        },
        {
          name: 'theme-color',
          media: '(prefers-color-scheme: dark)',
          content: themeColors.dark,
        },
        ...seo({
          title: isGlobalNotFound ? 'ページが見つかりません' : undefined,
          description: site.description,
          noindex: isNotFound,
        }),
        { property: 'og:type', content: 'website' },
        { property: 'og:site_name', content: site.name },
        { property: 'og:locale', content: site.locale },
        ...(isNotFound ? [] : [{ property: 'og:url', content: url }]),
        { property: 'og:image', content: imageUrl },
        { property: 'og:image:alt', content: site.image.alt },
        { name: 'twitter:card', content: 'summary' },
        { name: 'twitter:site', content: site.xHandle },
        { name: 'twitter:creator', content: site.xHandle },
        ...(isNotFound ? [] : [{ name: 'twitter:url', content: url }]),
        { name: 'twitter:image', content: imageUrl },
        jsonLd({
          '@graph': [
            {
              '@type': 'WebSite',
              '@id': websiteId,
              name: site.name,
              url: absoluteUrl('/'),
              description: site.description,
              inLanguage: 'ja',
              publisher: { '@id': personId },
            },
            {
              '@type': 'Person',
              '@id': personId,
              name: site.name,
              url: absoluteUrl('/'),
              image: imageUrl,
              description: site.personDescription,
              knowsAbout: site.knowsAbout,
              sameAs: site.social.map((s) => s.url),
            },
          ],
        }),
        ...(isNotFound ? [] : breadcrumbJsonLd(matches)),
      ],
      links: [
        { rel: 'stylesheet', href: appCss },
        { rel: 'icon', href: '/favicon.ico', sizes: 'any' },
        { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
        {
          rel: 'alternate',
          type: 'application/rss+xml',
          title: `${site.name} のブログ`,
          href: absoluteUrl('/rss.xml'),
        },
        // link は親子で重複排除されないので canonical はここだけで出す
        ...(isNotFound ? [] : [{ rel: 'canonical', href: url }]),
      ],
    }
  },
  // ログインしているらしいか（Clerk を読み込むか）。ページを移るたびに読み直す
  // Clerk を使うページ（管理画面・ログイン・ログイン中）では、描く前に Clerk の部品を読み込んでおく
  loader: async ({ location }) => {
    const signedInHint = readSignedInHint()
    if (signedInHint || isClerkPath(location.pathname)) await preloadClerk()
    return { signedInHint }
  },
  notFoundComponent: NotFound,
  shellComponent: RootDocument,
})

function NotFound() {
  return (
    <NotFoundPage
      width="max-w-5xl"
      title="ページが見つかりません"
      message="お探しのページは存在しないか、移動した可能性があります。"
    />
  )
}

/** ログインの画面（Clerk の部品で作っている） */
const isSignInPath = (pathname: string) =>
  pathname === '/sign-in' || pathname.startsWith('/sign-in/')

function RootDocument({ children }: { children: React.ReactNode }) {
  const isAdmin = useRouterState({
    select: (state) =>
      state.location.pathname === '/admin' ||
      state.location.pathname.startsWith('/admin/'),
  })
  // Clerk（ログイン）のプログラムは、管理画面・ログインの画面と、ログインしているらしいときだけ読み込む。
  // ログインしていない訪問者には、Clerk の本体・画面の部品・ロボット対策の通信を発生させない
  const needsClerk = useRouterState({
    select: (state) =>
      isSignInPath(state.location.pathname) ||
      (state.matches[0]?.loaderData as { signedInHint?: boolean } | undefined)
        ?.signedInHint === true,
  })

  const nonce = useRouter().options.ssr?.nonce
  const theme = useResolvedTheme()
  useEffect(watchTheme, [])

  return (
    // dark クラスと color-scheme は、描画の前に themeInitScript が付ける（サーバーの HTML とずれてよい）
    <html lang="ja" suppressHydrationWarning>
      <head>
        {/* ブラウザ側のルーターが CSP の nonce を読むためのもの（src/router.tsx） */}
        <meta property="csp-nonce" nonce={nonce} />
        <HeadContent />
        {/* theme-color の meta より後に置く（スクリプトが書き換える） */}
        <ScriptOnce>{themeInitScript}</ScriptOnce>
      </head>
      <body>
        {isAdmin || needsClerk ? (
          <ClerkRoot nonce={nonce}>
            <TooltipProvider>
              {/* 管理画面は /admin のルートで専用のレイアウトを使う */}
              {isAdmin ? children : <SiteShell>{children}</SiteShell>}
              <LazyToaster theme={theme} richColors position="top-center" />
              <NavigationProgress />
            </TooltipProvider>
          </ClerkRoot>
        ) : (
          <TooltipProvider>
            <SiteShell>{children}</SiteShell>
            <LazyToaster theme={theme} richColors position="top-center" />
            <NavigationProgress />
          </TooltipProvider>
        )}
        <TanStackDevtools
          config={{
            position: 'bottom-right',
          }}
          plugins={[
            {
              name: 'Tanstack Router',
              render: <TanStackRouterDevtoolsPanel />,
            },
          ]}
        />
        <Scripts />
      </body>
    </html>
  )
}
