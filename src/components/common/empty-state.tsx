import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

/** 一覧が空のときなどに出す、点線の枠つきの案内 */
export function EmptyState({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <p
      className={cn(
        'rounded-lg border border-dashed p-8 text-center text-muted-foreground',
        className,
      )}
    >
      {children}
    </p>
  )
}
