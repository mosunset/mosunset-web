import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { AttributeField } from '@/lib/collections'

/** コレクションの種類ごとの追加項目の入力欄（文字・URL・日付・選択） */
export function AttributeInput({
  field,
  value,
  onChange,
}: {
  field: AttributeField
  value: string
  onChange: (value: string) => void
}) {
  const id = `attr-${field.key}`

  if (field.type === 'select') {
    return (
      <div className="space-y-2">
        <Label htmlFor={id}>{field.label}</Label>
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 w-full rounded-lg border border-input bg-transparent px-2.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:h-8 md:text-sm dark:bg-input/30"
        >
          <option value="">—</option>
          {field.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{field.label}</Label>
      <Input
        id={id}
        type={field.type === 'text' ? 'text' : field.type}
        value={value}
        placeholder={field.type === 'text' ? field.placeholder : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}
