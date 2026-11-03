import type * as React from 'react'

import { AppBreadcrumb } from '@/components/app-breadcrumb'
import { AppSidebar } from '@/components/app-sidebar'
import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'

/** 公開サイトのレイアウト（ヘッダー・必要なときだけ出るサイドバー・フッター） */
export function SiteShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="[--header-height:--spacing(14)]">
      {/* キーボードで操作する人が、ヘッダーのリンクを飛ばして本文へ移れるように */}
      <a
        href="#content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-100 focus:rounded-md focus:bg-background focus:px-4 focus:py-2 focus:shadow-lg focus:ring-2 focus:ring-ring"
      >
        本文へ移動
      </a>
      <SidebarProvider defaultOpen={false} className="flex flex-col">
        <SiteHeader />
        <div className="flex flex-1">
          <AppSidebar className="top-(--header-height) h-[calc(100svh-var(--header-height))]!" />
          <SidebarInset>
            <AppBreadcrumb className="mx-auto w-full max-w-5xl px-6 pt-6" />
            <div id="content" tabIndex={-1} className="flex-1 outline-none">
              {children}
            </div>
            <SiteFooter />
          </SidebarInset>
        </div>
      </SidebarProvider>
    </div>
  )
}
