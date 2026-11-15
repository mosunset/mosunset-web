import { BackLinkFooter } from '@/components/common/back-link-footer'
import { ToolPageNeighbors } from '@/components/playground/related-tools'
import {
  ToolAfter,
  ToolBody,
  toolUsage,
} from '@/components/playground/tool-registry'
import { UsageButton } from '@/components/playground/usage-panel'
import { Badge } from '@/components/ui/badge'
import { getPlaygroundTool, type PlaygroundSlug } from '@/lib/playground/tools'
import { cn } from '@/lib/utils'

/**
 * ツールのページ（/playground/$slug）。名前・説明・幅は src/lib/playground/tools.ts の 1 件から、
 * 本体・使い方・下の文章は src/components/playground/tools/<slug>/ から出す（tool-registry.tsx）
 */
export function ToolPage({ slug }: { slug: PlaygroundSlug }) {
  const tool = getPlaygroundTool(slug)
  const usage = toolUsage(slug)

  return (
    <div
      className={cn(
        'mx-auto w-full px-4 py-6 sm:px-6 sm:py-8',
        tool.wide ? 'max-w-6xl' : 'max-w-4xl',
      )}
    >
      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{tool.category}</Badge>
          {tool.tags.slice(0, 4).map((tag) => (
            <span key={tag} className="text-xs text-muted-foreground">
              #{tag}
            </span>
          ))}
        </div>
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-2xl font-bold sm:text-3xl">{tool.name}</h1>
          {usage && <UsageButton toolName={tool.name} usage={usage} />}
        </div>
        <p className="text-muted-foreground">{tool.description}</p>
      </header>

      <div className="mt-8">
        <ToolBody slug={slug} />
      </div>

      <ToolAfter slug={slug} />

      <BackLinkFooter
        to="/playground"
        slug={slug}
        before={<ToolPageNeighbors slug={slug} />}
      >
        プレイグラウンドの一覧へ
      </BackLinkFooter>
    </div>
  )
}
