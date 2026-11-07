import { Check, CircleHelp, Copy, Mic, Square } from 'lucide-react'
import type * as React from 'react'
import { useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
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

/**
 * 設定の説明を出す「？」ボタン。カーソルを当てるかフォーカスすると出し、
 * スマホでもタップで出し入れできるよう、クリックで開閉する
 */
export function HelpTip({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <Tooltip open={open} onOpenChange={setOpen}>
      <TooltipTrigger
        type="button"
        aria-label="この設定の説明"
        // Radix はクリックで閉じるので、それを止めて開閉を切り替える
        onClick={(e) => {
          e.preventDefault()
          setOpen((v) => !v)
        }}
        className="inline-flex size-4 shrink-0 items-center justify-center align-middle text-muted-foreground hover:text-foreground"
      >
        <CircleHelp className="size-3.5" />
      </TooltipTrigger>
      <TooltipContent className="max-w-72 leading-relaxed">
        {children}
      </TooltipContent>
    </Tooltip>
  )
}

/** ラベルと今の値を上に出すスライダー */
export function RangeSlider({
  label,
  value,
  min,
  max,
  step,
  unit,
  format,
  help,
  onChange,
}: {
  label: string
  /** ラベルの横の「？」で出す説明 */
  help?: React.ReactNode
  value: number
  min: number
  max: number
  step: number
  unit?: string
  /** 表示する値の形（省略するとそのまま出す） */
  format?: (value: number) => React.ReactNode
  onChange: (v: number) => void
}) {
  return (
    <label className="space-y-2">
      <span className="flex justify-between text-sm">
        <span className="flex items-center gap-1">
          {label}
          {help && <HelpTip>{help}</HelpTip>}
        </span>
        <span className="font-mono tabular-nums">
          {format ? format(value) : value}
          {unit}
        </span>
      </span>
      <input
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-primary"
      />
    </label>
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
