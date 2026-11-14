import type * as React from 'react'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

/** 入手・公開から日が浅いもの（isRecent）に付ける印 */
export function NewBadge({ className }: { className?: string }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        'border-sky-500/60 bg-sky-500/10 text-sky-700 dark:text-sky-300',
        className,
      )}
    >
      新着
    </Badge>
  )
}

/**
 * 状態の印（読書中・学習中・手放した など）。
 * accent は目立たせたいもの、dim は薄く出すもの（手放した・まだ取っていない）に付ける
 */
export function StatusBadge({
  tone,
  children,
  className,
}: {
  tone: 'accent' | 'dim'
  children: React.ReactNode
  className?: string
}) {
  return (
    <Badge
      variant={tone === 'accent' ? 'default' : 'secondary'}
      className={cn(tone === 'dim' && 'text-muted-foreground', className)}
    >
      {children}
    </Badge>
  )
}
