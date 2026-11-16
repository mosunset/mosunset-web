import { Check, Copy } from 'lucide-react'
import * as React from 'react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { articleToString, type ExportFormat } from '@/lib/article-export'

type Status = 'idle' | 'copied' | 'failed'

const statusLabels: Record<Status, string> = {
  idle: 'コピー',
  copied: 'コピーしました',
  failed: 'コピーできませんでした',
}

/**
 * 記事のタイトルと本文を、プレーンテキストか Markdown でコピーするボタン。
 * 本文は画面に出ている HTML から作る（src/lib/article-export.ts）
 */
export function CopyArticleMenu({
  title,
  bodyRef,
  className,
}: {
  title: string
  bodyRef: React.RefObject<HTMLElement | null>
  className?: string
}) {
  const [status, setStatus] = React.useState<Status>('idle')
  const timer = React.useRef<number>(undefined)
  React.useEffect(() => () => window.clearTimeout(timer.current), [])

  const copy = (format: ExportFormat) => {
    const body = bodyRef.current
    if (!body) return
    const show = (next: Status) => {
      setStatus(next)
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => setStatus('idle'), 2000)
    }
    navigator.clipboard.writeText(articleToString(body, format, title)).then(
      () => show('copied'),
      () => show('failed'),
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className={className}>
          {status === 'copied' ? (
            <Check aria-hidden="true" />
          ) : (
            <Copy aria-hidden="true" />
          )}
          {/* 結果を読み上げでも知らせる */}
          <span aria-live="polite">{statusLabels[status]}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel>記事をコピー</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => copy('text')}>
          プレーンテキスト
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => copy('markdown')}>
          Markdown
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
