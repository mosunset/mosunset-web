import { ChevronDown, List } from 'lucide-react'
import * as React from 'react'

import { cn } from '@/lib/utils'
import type { TocItem } from '@/server/rich-text'

/** 今読んでいる見出しの id（画面の上のほうにある、いちばん後ろの見出し） */
function useActiveHeading(ids: string[]) {
  const [active, setActive] = React.useState<string | null>(null)
  React.useEffect(() => {
    if (ids.length === 0) return
    const elements = ids
      .map((id) => document.getElementById(id))
      .filter((e): e is HTMLElement => e !== null)
    const update = () => {
      // ヘッダーの下（少し余裕を持たせた位置）より上にある、いちばん後ろの見出し
      const line = 120
      let current: string | null = null
      for (const e of elements) {
        if (e.getBoundingClientRect().top - line <= 0) current = e.id
        else break
      }
      // いちばん下まで来たら、最後の見出し（短い節は上まで来ないため）
      const bottom =
        window.innerHeight + window.scrollY >=
        document.documentElement.scrollHeight - 4
      if (bottom) current = elements.at(-1)?.id ?? current
      setActive(current ?? elements[0]?.id ?? null)
    }
    update()
    window.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [ids])
  return active
}

function TocList({
  toc,
  active,
  onNavigate,
}: {
  toc: TocItem[]
  active?: string | null
  onNavigate?: () => void
}) {
  return (
    <ol className="space-y-1 text-sm">
      {toc.map((item) => (
        <li key={item.id} className={cn(item.level === 3 && 'pl-4')}>
          <a
            href={`#${item.id}`}
            onClick={onNavigate}
            aria-current={active === item.id ? 'location' : undefined}
            className={cn(
              'block border-l-2 py-1 pl-3 leading-snug text-muted-foreground transition-colors hover:text-foreground',
              active === item.id
                ? 'border-foreground font-medium text-foreground'
                : 'border-transparent',
            )}
          >
            {item.text}
          </a>
        </li>
      ))}
    </ol>
  )
}

/** 広い画面で、本文の横に付いてくる目次 */
export function ArticleTocAside({ toc }: { toc: TocItem[] }) {
  const ids = React.useMemo(() => toc.map((t) => t.id), [toc])
  const active = useActiveHeading(ids)
  return (
    <nav
      aria-label="目次"
      className="sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto pb-6"
    >
      <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <List className="size-3.5" />
        目次
      </p>
      <TocList toc={toc} active={active} />
    </nav>
  )
}

/** 狭い画面で、本文の前に置く畳める目次 */
export function ArticleTocDisclosure({
  toc,
  className,
}: {
  toc: TocItem[]
  className?: string
}) {
  const ref = React.useRef<HTMLDetailsElement>(null)
  return (
    <details
      ref={ref}
      className={cn('group rounded-lg border bg-muted/30', className)}
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
        <List className="size-4 text-muted-foreground" />
        目次
        <span className="text-xs font-normal text-muted-foreground">
          {toc.length} 項目
        </span>
        <ChevronDown className="ml-auto size-4 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <nav aria-label="目次" className="border-t px-2 py-3">
        <TocList
          toc={toc}
          onNavigate={() => {
            if (ref.current) ref.current.open = false
          }}
        />
      </nav>
    </details>
  )
}
