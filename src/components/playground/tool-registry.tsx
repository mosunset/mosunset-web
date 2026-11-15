import { ClientOnly } from '@tanstack/react-router'
import { Loader2 } from 'lucide-react'
import * as React from 'react'

import {
  bySlug,
  hasAfter,
  isBrowserOnly,
  loadedPart,
  loadPart,
  type PartKind,
} from '@/components/playground/tool-modules'
import type { ToolUsage } from '@/components/playground/usage-panel'
import { findPlaygroundTool } from '@/lib/playground/tools'

/**
 * ツールのページで、ツールの中身（本体・下の文章・使い方）を描く部品。
 * 読み込みのしくみとフォルダの決まりは tool-modules.ts。こちらはツールのページでだけ読み込まれる
 */

/** 使い方（小さいので最初から読み込む。ツールのページでだけ読まれる） */
const usages = bySlug(
  import.meta.glob<ToolUsage>('./tools/*/usage.ts', {
    eager: true,
    import: 'usage',
  }),
)

export const toolUsage = (slug: string): ToolUsage | undefined => usages[slug]

const lazies = new Map<string, React.LazyExoticComponent<React.ComponentType>>()

/**
 * 部品を描く。読み込み済み（ルートの loader かブラウザの入口で読んだもの）ならそのまま、
 * まだなら lazy で読み込む（ページの中で別のツールへ移ったときなど）
 */
function Part({ part, slug }: { part: PartKind; slug: string }) {
  const Ready = loadedPart(part, slug)
  if (Ready) return <Ready />
  const key = `${part}:${slug}`
  let Lazy = lazies.get(key)
  if (!Lazy) {
    Lazy = React.lazy(async () => ({
      default: (await loadPart(part, slug)) ?? (() => null),
    }))
    lazies.set(key, Lazy)
  }
  return <Lazy />
}

/** 読み込み中の枠。高さは 256〜1200px（それより高いツールも、下のリンクは画面の外にあるので 1200px で足りる） */
function Loading({ slug }: { slug: string }) {
  const height = Math.min(
    Math.max(findPlaygroundTool(slug)?.loadingHeight ?? 256, 256),
    1200,
  )
  return (
    <div
      className="flex items-start justify-center gap-2 rounded-lg border pt-24 text-muted-foreground"
      style={{ minHeight: height }}
    >
      <Loader2 className="size-4 animate-spin" />
      読み込み中…
    </div>
  )
}

/** ツールの本体。ブラウザでだけ描くツールは、サーバーでは読み込み中の枠だけを出す */
export function ToolBody({ slug }: { slug: string }) {
  const body = (
    <React.Suspense fallback={<Loading slug={slug} />}>
      <Part part="tool" slug={slug} />
    </React.Suspense>
  )
  return isBrowserOnly(slug) ? (
    <ClientOnly fallback={<Loading slug={slug} />}>{body}</ClientOnly>
  ) : (
    body
  )
}

/** ツールの下に出す文章（ないツールは何も出さない） */
export function ToolAfter({ slug }: { slug: string }) {
  if (!hasAfter(slug)) return null
  return (
    <React.Suspense fallback={null}>
      <Part part="after" slug={slug} />
    </React.Suspense>
  )
}
