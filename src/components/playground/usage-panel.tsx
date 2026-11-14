import { CircleHelp, GripHorizontal, Lightbulb, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import type { ToolUsage } from '@/lib/playground-usage'
import { cn } from '@/lib/utils'

/**
 * ツールのページの「使い方」ボタンと、押すと浮かんで出る使い方の窓。
 * 窓は画面を覆わないので、読みながらツールを操作できる。上の帯をドラッグすると動かせる
 * （スマホでは画面の下に出す）。Esc か × で閉じる
 */
export function UsageButton({
  toolName,
  usage,
}: {
  toolName: string
  usage: ToolUsage
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button
        type="button"
        variant={open ? 'secondary' : 'outline'}
        size="sm"
        aria-expanded={open}
        aria-controls="tool-usage"
        onClick={() => setOpen((o) => !o)}
        className="shrink-0"
      >
        <CircleHelp />
        使い方
      </Button>
      {open && (
        <UsagePanel
          toolName={toolName}
          usage={usage}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}

function UsagePanel({
  toolName,
  usage,
  onClose,
}: {
  toolName: string
  usage: ToolUsage
  onClose: () => void
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  /** ドラッグで動かした位置（動かす前は右下の決まった位置） */
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const drag = useRef<{ dx: number; dy: number } | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    panelRef.current?.focus()
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const startDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    // スマホ（下に出す形）では動かさない
    if (window.innerWidth < 640) return
    const rect = panelRef.current?.getBoundingClientRect()
    if (!rect) return
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top }
  }
  const moveDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current || !panelRef.current) return
    const w = panelRef.current.offsetWidth
    const h = panelRef.current.offsetHeight
    setPos({
      x: Math.min(
        Math.max(8, e.clientX - drag.current.dx),
        window.innerWidth - w - 8,
      ),
      y: Math.min(
        Math.max(8, e.clientY - drag.current.dy),
        window.innerHeight - Math.min(h, 120),
      ),
    })
  }
  const endDrag = () => {
    drag.current = null
  }

  return (
    <div
      id="tool-usage"
      ref={panelRef}
      role="dialog"
      aria-modal="false"
      aria-label={`${toolName}の使い方`}
      tabIndex={-1}
      style={
        pos
          ? { left: pos.x, top: pos.y, right: 'auto', bottom: 'auto' }
          : undefined
      }
      className={cn(
        'fixed z-50 flex flex-col overflow-hidden border bg-background shadow-xl outline-none',
        // スマホ: 画面の下に出す / それより広い画面: 右下に浮かせる（タイトルの右の「使い方」ボタンを隠さない）
        'inset-x-0 bottom-0 max-h-[70vh] rounded-t-xl',
        'sm:inset-x-auto sm:right-6 sm:bottom-6 sm:top-auto sm:max-h-[min(36rem,calc(100vh-6rem))] sm:w-[24rem] sm:rounded-xl',
      )}
    >
      <div
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className="flex items-center gap-2 border-b bg-muted/40 px-4 py-2 sm:cursor-move sm:touch-none sm:select-none"
      >
        <GripHorizontal className="hidden size-4 text-muted-foreground sm:block" />
        <h2 className="flex-1 text-sm font-semibold">{toolName}の使い方</h2>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="使い方を閉じる"
          onClick={onClose}
          className="size-7"
        >
          <X />
        </Button>
      </div>
      <div className="overflow-y-auto px-4 py-3 text-sm">
        <ol className="space-y-2.5">
          {usage.steps.map((step, i) => (
            <li key={step} className="flex gap-2.5">
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
                {i + 1}
              </span>
              <span className="leading-relaxed">{step}</span>
            </li>
          ))}
        </ol>
        {usage.tips.length > 0 && (
          <div className="mt-4 space-y-1.5 rounded-lg bg-muted/50 p-3">
            <p className="flex items-center gap-1 text-xs font-semibold text-muted-foreground">
              <Lightbulb className="size-3.5" />
              ヒント
            </p>
            <ul className="space-y-1 text-xs leading-relaxed text-muted-foreground">
              {usage.tips.map((tip) => (
                <li key={tip}>・{tip}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
