import { jaJP } from '@clerk/localizations'
import { ClerkProvider } from '@clerk/tanstack-react-start'
import { shadcn } from '@clerk/ui/themes'
import { TanStackDevtools } from '@tanstack/react-devtools'
import {
  type AnyRouteMatch,
  createRootRoute,
  HeadContent,
  rootRouteId,
  Scripts,
  useRouter,
  useRouterState,
} from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'

import { SiteShell } from '@/components/site-shell'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'

import {
  absoluteUrl,
  jsonLd,
  normalizePath,
  personId,
  seo,
  websiteId,
} from '@/lib/seo'
import { site } from '@/lib/site'

import appCss from '../styles.css?url'

/** パンくず（staticData.breadcrumb）を構造化データにする。2 階層目から出す */
function breadcrumbJsonLd(matches: AnyRouteMatch[]) {
  const crumbs: { name: string; path: string }[] = []
  for (const match of matches) {
    const option = match.staticData?.breadcrumb
    const name = typeof option === 'function' ? option(match) : option
    if (!name) continue
    const path = normalizePath(match.pathname)
    if (crumbs.at(-1)?.path === path) crumbs.pop()
    crumbs.push({ name, path })
  }
  if (crumbs.length <= 1) return []
  return [
    jsonLd({
      '@type': 'BreadcrumbList',
      itemListElement: crumbs.map((c, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: c.name,
        item: absoluteUrl(c.path),
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
        { name: 'theme-color', content: site.themeColor },
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
  notFoundComponent: NotFound,
  shellComponent: RootDocument,
})

function NotFound() {
  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8">
      <h1 className="text-3xl font-bold">ページが見つかりません</h1>
      <p className="mt-4 text-muted-foreground">
        お探しのページは存在しないか、移動した可能性があります。
      </p>
    </div>
  )
}

function RootDocument({ children }: { children: React.ReactNode }) {
  const isAdmin = useRouterState({
    select: (state) =>
      state.location.pathname === '/admin' ||
      state.location.pathname.startsWith('/admin/'),
  })

  const nonce = useRouter().options.ssr?.nonce

  return (
    <html lang="ja">
      <head>
        {/* ブラウザ側のルーターが CSP の nonce を読むためのもの（src/router.tsx） */}
        <meta property="csp-nonce" nonce={nonce} />
        <HeadContent />
      </head>
      <body>
        <ClerkProvider
          nonce={nonce}
          appearance={{ theme: shadcn }}
          signInUrl="/sign-in"
          localization={jaJP}
        >
          <TooltipProvider>
            {/* 管理画面は /admin のルートで専用のレイアウトを使う */}
            {isAdmin ? children : <SiteShell>{children}</SiteShell>}
            <Toaster richColors position="top-center" />
          </TooltipProvider>
        </ClerkProvider>
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
