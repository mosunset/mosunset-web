import { ClientOnly } from '@tanstack/react-router'
import { Loader2 } from 'lucide-react'
import type * as React from 'react'
import { lazy, type ReactNode, Suspense } from 'react'

import { BackLinkFooter } from '@/components/back-link-footer'
import { Badge } from '@/components/ui/badge'
import { getPlaygroundTool, type PlaygroundSlug } from '@/lib/playground'
import { seo } from '@/lib/seo'
import { cn } from '@/lib/utils'

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

const loading = (
  <div className="flex h-64 items-center justify-center gap-2 rounded-lg border text-muted-foreground">
    <Loader2 className="size-4 animate-spin" />
    読み込み中…
  </div>
)

/**
 * ツールの本体を、ブラウザでだけ読み込む部品にする。
 * サーバー用のビルドでは import.meta.env.SSR が true になり、import ごと消えるので、
 * three.js や TensorFlow.js などの重いライブラリが Worker に入らない。
 * import() はビルド時に消せるよう、呼び出し側（各ルート）に書く
 */
export function clientOnlyTool(
  load: (() => Promise<{ default: React.ComponentType }>) | null,
): React.ComponentType {
  return load ? lazy(load) : () => null
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
  after,
}: {
  slug: PlaygroundSlug
  clientOnly?: boolean
  /** 横に広いツールは幅を広げる */
  wide?: boolean
  children: ReactNode
  /** ツールの下に置く文章（仕様など）。clientOnly でもサーバーで描画する */
  after?: ReactNode
}) {
  const tool = getPlaygroundTool(slug)

  return (
    <div
      className={cn(
        'mx-auto w-full px-4 py-6 sm:px-6 sm:py-8',
        wide ? 'max-w-6xl' : 'max-w-4xl',
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
        <h1 className="text-2xl font-bold sm:text-3xl">{tool.name}</h1>
        <p className="text-muted-foreground">{tool.description}</p>
      </header>

      <div className="mt-8">
        {clientOnly ? (
          // ツールの本体は lazy() で後から読み込むので、それを待つあいだも同じ表示にする
          <ClientOnly fallback={loading}>
            <Suspense fallback={loading}>{children}</Suspense>
          </ClientOnly>
        ) : (
          children
        )}
      </div>

      {after}

      <BackLinkFooter to="/playground">プレイグラウンドの一覧へ</BackLinkFooter>
    </div>
  )
}
