import { Check, Copy, Mic, Square } from 'lucide-react'
import type * as React from 'react'
import { useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/** 数値を 1 つ大きく見せるカード */
export function Stat({
  label,
  value,
  unit,
  hint,
  className,
}: {
  label: string
  value: React.ReactNode
  unit?: string
  hint?: string
  className?: string
}) {
  return (
    <div className={cn('rounded-lg border p-3 sm:p-4', className)}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="font-mono text-2xl font-bold tabular-nums">
          {value}
        </span>
        {unit && <span className="text-sm text-muted-foreground">{unit}</span>}
      </div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  )
}

/** クリックでクリップボードにコピーするボタン */
export function CopyButton({
  value,
  label = 'コピー',
  size = 'sm',
}: {
  value: string
  label?: string
  size?: 'sm' | 'icon'
}) {
  const [copied, setCopied] = useState(false)
  return (
    <Button
      type="button"
      variant="outline"
      size={size === 'icon' ? 'icon' : 'sm'}
      aria-label={label}
      title={label}
      disabled={!value}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value)
          setCopied(true)
          window.setTimeout(() => setCopied(false), 1500)
        } catch {
          toast.error('コピーできませんでした')
        }
      }}
    >
      {copied ? <Check /> : <Copy />}
      {size !== 'icon' && (copied ? 'コピーしました' : label)}
    </Button>
  )
}

/** 音声入力の開始・停止ボタン（対応していないブラウザでは出さない） */
export function VoiceButton({
  supported,
  listening,
  onToggle,
}: {
  supported: boolean
  listening: boolean
  onToggle: () => void
}) {
  if (!supported) return null
  return (
    <Button
      type="button"
      variant={listening ? 'destructive' : 'outline'}
      size="sm"
      onClick={onToggle}
    >
      {listening ? <Square /> : <Mic />}
      {listening ? '止める' : '音声入力'}
    </Button>
  )
}
