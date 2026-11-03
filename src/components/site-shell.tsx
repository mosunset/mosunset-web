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
      <SidebarProvider defaultOpen={false} className="flex flex-col">
        <SiteHeader />
        <div className="flex flex-1">
          <AppSidebar className="top-(--header-height) h-[calc(100svh-var(--header-height))]!" />
          <SidebarInset>
            <AppBreadcrumb className="mx-auto w-full max-w-5xl px-6 pt-6" />
            <div className="flex-1">{children}</div>
            <SiteFooter />
          </SidebarInset>
        </div>
      </SidebarProvider>
    </div>
  )
}
