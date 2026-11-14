import { Badge } from '@/components/ui/badge'

/** 下書き・非公開のもの（管理者のログイン中だけ公開側のページにも出る）に付ける印 */
export function DraftBadge({ className }: { className?: string }) {
  return (
    <Badge
      variant="outline"
      className={`border-amber-500/60 bg-amber-500/10 text-amber-700 dark:text-amber-400 ${className ?? ''}`}
    >
      下書き
    </Badge>
  )
}
