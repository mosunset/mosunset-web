import type * as React from 'react'

import type { NavItem } from '@/lib/navigation'

/** 第一階層ページの共通の見出し */
export function SectionPage({
  item,
  actions,
  children,
}: {
  item: NavItem
  /** 見出しの右に置くもの（RSS のリンクなど） */
  actions?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8">
      <div className="flex items-center gap-3">
        <item.icon className="size-7 text-muted-foreground" />
        <h1 className="text-3xl font-bold">{item.title}</h1>
        {actions && <div className="ml-auto">{actions}</div>}
      </div>
      <p className="mt-2 text-muted-foreground">{item.description}</p>
      <div className="mt-8">{children}</div>
    </div>
  )
}
