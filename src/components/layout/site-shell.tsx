import { useLocation } from '@tanstack/react-router'
import type * as React from 'react'

import { AppBreadcrumb } from '@/components/layout/app-breadcrumb'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { BackToTop } from '@/components/layout/back-to-top'
import { SiteFooter } from '@/components/layout/site-footer'
import { SiteHeader } from '@/components/layout/site-header'
import { SiteSearchDialog } from '@/components/layout/site-search'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { useScrollReveal } from '@/lib/motion'

/** 公開サイトのレイアウト（ヘッダー・必要なときだけ出るサイドバー・フッター） */
export function SiteShell({ children }: { children: React.ReactNode }) {
  // スクロールで出てくる動き（ページや絞り込みが変わったら、やり直す）
  const href = useLocation({ select: (location) => location.href })
  useScrollReveal(href)
  return (
    <div className="[--header-height:--spacing(14)]">
      {/* キーボードで操作する人が、ヘッダーのリンクを飛ばして本文へ移れるように */}
      <a
        href="#content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-100 focus:rounded-md focus:bg-background focus:px-4 focus:py-2 focus:shadow-lg focus:ring-2 focus:ring-ring"
      >
        本文へ移動
      </a>
      {/* 公開側のサイドバーは狭い画面のメニューなので、Ctrl+B では開かない（広い画面では閉じるボタンがない） */}
      <SidebarProvider
        defaultOpen={false}
        keyboardShortcut={false}
        className="flex flex-col"
      >
        <SiteHeader />
        <div className="flex flex-1">
          <AppSidebar className="top-(--header-height) h-[calc(100svh-var(--header-height))]!" />
          <SidebarInset>
            {/* 構造化データのパンくず（__root.tsx）は、一覧ページでもそのまま出す */}
            <AppBreadcrumb
              minDepth={3}
              className="mx-auto w-full max-w-5xl px-6 pt-6"
            />
            <div id="content" tabIndex={-1} className="flex-1 outline-none">
              {children}
            </div>
            <SiteFooter />
          </SidebarInset>
        </div>
        <SiteSearchDialog />
        <BackToTop />
      </SidebarProvider>
    </div>
  )
}
