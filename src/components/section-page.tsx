import type * as React from 'react'

import type { NavItem } from '@/lib/navigation'

/** 第一階層ページの共通の見出し */
export function SectionPage({
  item,
  children,
}: {
  item: NavItem
  children?: React.ReactNode
}) {
  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8">
      <div className="flex items-center gap-3">
        <item.icon className="size-7 text-muted-foreground" />
        <h1 className="text-3xl font-bold">{item.title}</h1>
      </div>
      <p className="mt-2 text-muted-foreground">{item.description}</p>
      <div className="mt-8">
        {children ?? (
          <p className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
            準備中です。
          </p>
        )}
      </div>
    </div>
  )
}
