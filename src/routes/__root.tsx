import { ClerkProvider } from '@clerk/tanstack-react-start'
import { shadcn } from '@clerk/ui/themes'
import { TanStackDevtools } from '@tanstack/react-devtools'
import {
  createRootRoute,
  HeadContent,
  rootRouteId,
  Scripts,
} from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'

import { AppBreadcrumb } from '@/components/app-breadcrumb'
import { AppSidebar } from '@/components/app-sidebar'
import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { TooltipProvider } from '@/components/ui/tooltip'

import { absoluteUrl, normalizePath, seo } from '@/lib/seo'
import { site } from '@/lib/site'

import appCss from '../styles.css?url'

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
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
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
        { property: 'og:image:type', content: site.image.type },
        { property: 'og:image:width', content: String(site.image.width) },
        { property: 'og:image:height', content: String(site.image.height) },
        { property: 'og:image:alt', content: site.image.alt },
        { name: 'twitter:card', content: 'summary' },
        { name: 'twitter:site', content: site.xHandle },
        { name: 'twitter:creator', content: site.xHandle },
        ...(isNotFound ? [] : [{ name: 'twitter:url', content: url }]),
        { name: 'twitter:image', content: imageUrl },
        {
          'script:ld+json': {
            '@context': 'https://schema.org',
            '@type': 'WebSite',
            name: site.name,
            url: absoluteUrl('/'),
            description: site.description,
            inLanguage: 'ja',
            author: {
              '@type': 'Person',
              name: site.name,
              url: absoluteUrl('/'),
              sameAs: site.social.map((s) => s.url),
            },
          },
        },
      ],
      links: [
        { rel: 'stylesheet', href: appCss },
        { rel: 'icon', href: '/favicon.ico', sizes: 'any' },
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
  return (
    <html lang="ja">
      <head>
        <HeadContent />
      </head>
      <body>
        <ClerkProvider
          appearance={{ theme: shadcn }}
          signInUrl="/sign-in"
          localization={{ locale: 'ja-JP' }}
        >
          <TooltipProvider>
            <div className="[--header-height:--spacing(14)]">
              <SidebarProvider defaultOpen={false} className="flex flex-col">
                <SiteHeader />
                <div className="flex flex-1">
                  <AppSidebar className="top-(--header-height) h-[calc(100svh-var(--header-height))]!" />
                  <SidebarInset>
                    <AppBreadcrumb />
                    <div className="flex-1">{children}</div>
                    <SiteFooter />
                  </SidebarInset>
                </div>
              </SidebarProvider>
            </div>
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
