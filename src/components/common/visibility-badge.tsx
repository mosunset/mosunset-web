import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { type Visibility, visibilityLabels } from '@/lib/visibility'

/**
 * 限定公開・未公開のものに付ける印（公開のものには何も出さない）。
 * 限定公開は見られる人（管理者・役割が viewer の人）に、未公開は管理者のログイン中だけ、公開側のページにも出る
 */
export function VisibilityBadge({
  visibility,
  className,
}: {
  visibility: Visibility
  className?: string
}) {
  if (visibility === 'published') return null
  return (
    <Badge
      variant="outline"
      className={cn(
        visibility === 'limited'
          ? 'border-sky-500/60 bg-sky-500/10 text-sky-700 dark:text-sky-400'
          : 'border-amber-500/60 bg-amber-500/10 text-amber-700 dark:text-amber-400',
        className,
      )}
    >
      {visibilityLabels[visibility]}
    </Badge>
  )
}
