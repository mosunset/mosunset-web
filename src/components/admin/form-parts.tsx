import { Link } from '@tanstack/react-router'
import { ExternalLink, Trash2 } from 'lucide-react'
import type { ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import type { CollectionKind, collections } from '@/lib/collections'

/** 記事・コレクションの編集フォームで共通の部品 */

/** 保存に失敗したときなどに出すエラーの枠。message が空なら何も出さない */
export function FormError({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <p className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
      {message}
    </p>
  )
}

/** 画面の下に固定する操作バー */
export function StickyActionBar({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center gap-2 border-t bg-background/95 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur sm:-mx-6 sm:px-6">
      {children}
    </div>
  )
}

/** 公開ページを別タブで開くボタン */
export function PublicPageLink({
  to,
  slug,
}: {
  to: '/blog/$slug' | (typeof collections)[CollectionKind]['detailPath']
  slug: string
}) {
  return (
    <Button asChild variant="ghost" size="sm">
      <Link to={to} params={{ slug }} target="_blank">
        <ExternalLink />
        <span className="hidden sm:inline">公開ページ</span>
      </Link>
    </Button>
  )
}

/** 操作バーの「削除」ボタン */
export function DeleteButton({
  disabled,
  onClick,
}: {
  disabled: boolean
  onClick: () => void
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="text-destructive hover:text-destructive"
      disabled={disabled}
      onClick={onClick}
    >
      <Trash2 />
      <span className="hidden sm:inline">削除</span>
    </Button>
  )
}
