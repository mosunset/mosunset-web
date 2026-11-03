import { ClientOnly, Link } from '@tanstack/react-router'
import { ArrowLeft, Loader2 } from 'lucide-react'
import type * as React from 'react'

import { Badge } from '@/components/ui/badge'
import { getPlaygroundTool, type PlaygroundSlug } from '@/lib/playground'
import { seo } from '@/lib/seo'

/** 各ツールのルートで共通の設定（パンくず・title・description） */
export function toolRouteOptions(slug: PlaygroundSlug) {
  const tool = getPlaygroundTool(slug)
  return {
    staticData: { breadcrumb: tool.name },
    head: () => ({
      meta: seo({ title: tool.title, description: tool.description }),
    }),
  }
}

/**
 * ツールのページの枠。
 * clientOnly のツール（canvas・カメラ・大きなライブラリを使うもの）は、ブラウザでだけ描画する。
 */
export function ToolPage({
  slug,
  clientOnly = false,
  wide = false,
  children,
}: {
  slug: PlaygroundSlug
  clientOnly?: boolean
  /** 横に広いツールは幅を広げる */
  wide?: boolean
  children: React.ReactNode
}) {
  const tool = getPlaygroundTool(slug)

  return (
    <div
      className={`mx-auto w-full px-4 py-6 sm:px-6 sm:py-8 ${wide ? 'max-w-6xl' : 'max-w-4xl'}`}
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
        <h1 className="text-2xl font-bold sm:text-3xl">{tool.name}</h1>
        <p className="text-muted-foreground">{tool.description}</p>
      </header>

      <div className="mt-8">
        {clientOnly ? (
          <ClientOnly
            fallback={
              <div className="flex h-64 items-center justify-center gap-2 rounded-lg border text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                読み込み中…
              </div>
            }
          >
            {children}
          </ClientOnly>
        ) : (
          children
        )}
      </div>

      <footer className="mt-12 border-t pt-6">
        <Link
          to="/playground"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          プレイグラウンドの一覧へ
        </Link>
      </footer>
    </div>
  )
}
