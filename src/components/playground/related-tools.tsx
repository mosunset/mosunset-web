import { Link } from '@tanstack/react-router'
import { ChevronLeft, ChevronRight } from 'lucide-react'

import {
  getPlaygroundTool,
  type PlaygroundSlug,
  playgroundTools,
} from '@/lib/playground'
import { cn } from '@/lib/utils'

/** 一覧のふだんの並び（新しい順。同じ日は登録した順） */
const toolsInListOrder = [...playgroundTools].sort((a, b) =>
  b.publishedDate.localeCompare(a.publishedDate),
)

/** 関係の近いツール（同じカテゴリなら 2 点、同じタグ 1 つにつき 1 点。同じ点なら新しいもの） */
function relatedTools(slug: PlaygroundSlug, count = 3) {
  const tool = getPlaygroundTool(slug)
  const tags = new Set(tool.tags)
  return toolsInListOrder
    .filter((t) => t.slug !== slug)
    .map((t) => ({
      tool: t,
      score:
        (t.category === tool.category ? 2 : 0) +
        t.tags.filter((tag) => tags.has(tag)).length,
    }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, count)
    .map((x) => x.tool)
}

/** ツールのページの終わりに置く、関係の近いツールと、一覧で前後のツールへのリンク */
export function ToolPageNeighbors({ slug }: { slug: PlaygroundSlug }) {
  const related = relatedTools(slug)
  const index = toolsInListOrder.findIndex((t) => t.slug === slug)
  const prev = toolsInListOrder[index - 1]
  const next = toolsInListOrder[index + 1]
  const box =
    'group flex min-w-0 flex-col gap-0.5 rounded-lg border p-3 hover:bg-muted/40'

  return (
    <>
      {related.length > 0 && (
        <section aria-labelledby="related-tools-heading">
          <h2
            id="related-tools-heading"
            className="text-sm font-medium text-muted-foreground"
          >
            関係の近いツール
          </h2>
          <ul className="mt-3 grid gap-3 sm:grid-cols-3">
            {related.map((t) => (
              <li key={t.slug}>
                <Link
                  to={`/playground/${t.slug}`}
                  className="group flex h-full gap-3 rounded-lg border p-2.5 transition-colors hover:bg-muted/40 sm:flex-col sm:gap-2"
                >
                  <img
                    src={t.thumbnail}
                    alt=""
                    loading="lazy"
                    className="aspect-[1200/630] w-24 shrink-0 self-start rounded-md border object-cover sm:w-full"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium group-hover:underline">
                      {t.name}
                    </span>
                    <span className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                      {t.description}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {(prev || next) && (
        <nav aria-label="前後のツール" className="grid grid-cols-2 gap-3">
          {prev ? (
            <Link to={`/playground/${prev.slug}`} className={box}>
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <ChevronLeft className="size-3.5" />
                前へ
              </span>
              <span className="truncate text-sm font-medium group-hover:underline">
                {prev.name}
              </span>
            </Link>
          ) : (
            <span />
          )}
          {next && (
            <Link
              to={`/playground/${next.slug}`}
              className={cn(box, 'items-end text-right')}
            >
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                次へ
                <ChevronRight className="size-3.5" />
              </span>
              <span className="max-w-full truncate text-sm font-medium group-hover:underline">
                {next.name}
              </span>
            </Link>
          )}
        </nav>
      )}
    </>
  )
}
