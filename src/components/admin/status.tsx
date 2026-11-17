import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import {
  type Visibility,
  visibilities,
  visibilityLabels,
} from '@/lib/visibility'

/** 状態を変えたときに、どうなるかの説明（確認や選ぶところに出す） */
export const statusNotes: Record<Visibility, string> = {
  published: '誰でも見られます。一覧・検索・サイトマップにも出ます。',
  limited:
    'ログインした、見られる人（管理者と、Clerk の役割が viewer の人）だけが見られます。検索エンジンには載せません。',
  draft: '管理画面だけで見られます。',
}

/** 管理画面の一覧に出す、公開の状態の印 */
export function StatusBadge({ status }: { status: Visibility }) {
  if (status === 'published') return <Badge>公開</Badge>
  return (
    <Badge
      variant="secondary"
      className={cn(
        status === 'limited' && 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
      )}
    >
      {visibilityLabels[status]}
    </Badge>
  )
}

/** 公開の状態を 3 つから選ぶ（コレクションの編集画面） */
export function StatusSelect({
  value,
  onChange,
  disabled,
}: {
  value: Visibility
  onChange: (value: Visibility) => void
  disabled?: boolean
}) {
  return (
    <fieldset className="space-y-1.5">
      <legend className="text-sm font-medium">公開の状態</legend>
      <div className="inline-flex rounded-md border p-0.5">
        {visibilities.map((v) => (
          <label
            key={v}
            className={cn(
              'cursor-pointer rounded px-3 py-1 text-sm transition-colors has-focus-visible:ring-2 has-focus-visible:ring-ring',
              value === v
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted',
            )}
          >
            <input
              type="radio"
              name="status"
              value={v}
              checked={value === v}
              disabled={disabled}
              onChange={() => onChange(v)}
              className="sr-only"
            />
            {visibilityLabels[v]}
          </label>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{statusNotes[value]}</p>
    </fieldset>
  )
}
