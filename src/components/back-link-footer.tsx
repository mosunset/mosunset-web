import { Link, type LinkProps } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import type * as React from 'react'

/** 詳細ページの末尾に置く「← 一覧へ」のリンク */
export function BackLinkFooter({
  to,
  children,
}: {
  to: LinkProps['to']
  children: React.ReactNode
}) {
  return (
    <footer className="mt-12 border-t pt-6">
      <Link
        to={to}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {children}
      </Link>
    </footer>
  )
}
