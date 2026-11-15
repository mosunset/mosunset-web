import { Link, type LinkProps } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import type * as React from 'react'

import { listItemId, useRememberedListSearch } from '@/lib/list-memory'

/**
 * 詳細ページの末尾に置く「← 一覧へ」のリンク。
 * 一覧で最後に使った絞り込みを付け直し、今見ていたもの（slug）の位置までスクロールして戻る
 */
export function BackLinkFooter({
  to,
  slug,
  before,
  children,
}: {
  to: LinkProps['to'] & string
  /** 今見ているもの。一覧でその位置まで戻る */
  slug?: string
  /** リンクの上に置くもの（前後のものへのリンクなど） */
  before?: React.ReactNode
  children: React.ReactNode
}) {
  const search = useRememberedListSearch(to)
  return (
    <footer className="mt-12 space-y-6 border-t pt-6">
      {before}
      <Link
        to={to}
        search={search ?? {}}
        hash={slug ? listItemId(slug) : undefined}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {children}
      </Link>
    </footer>
  )
}
