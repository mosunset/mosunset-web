import { UserButton } from '@clerk/tanstack-react-start'
import { ExternalLink } from 'lucide-react'
import type * as React from 'react'

import { AdminSidebar } from '@/components/admin/admin-sidebar'
import { AppBreadcrumb } from '@/components/layout/app-breadcrumb'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar'

/** 管理画面のレイアウト（常に出ている左メニュー＋上のバー） */
export function AdminShell({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider className="[--header-height:--spacing(14)]">
      <AdminSidebar />
      <SidebarInset className="min-w-0">
        <header className="sticky top-0 z-40 flex h-(--header-height) shrink-0 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur sm:px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator
            orientation="vertical"
            className="mr-1 data-[orientation=vertical]:h-4"
          />
          <AppBreadcrumb className="min-w-0 flex-1 [&_ol]:flex-nowrap [&_li]:min-w-0 [&_li]:truncate" />
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="hidden sm:inline-flex"
          >
            <a href="/" target="_blank" rel="noreferrer">
              <ExternalLink />
              サイトを見る
            </a>
          </Button>
          <UserButton />
        </header>
        <div className="flex-1">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  )
}
