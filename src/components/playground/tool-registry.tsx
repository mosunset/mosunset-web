import { ClientOnly } from '@tanstack/react-router'
import { Loader2 } from 'lucide-react'
import * as React from 'react'

import type { ToolUsage } from '@/components/playground/usage-panel'
import { findPlaygroundTool } from '@/lib/playground/tools'

/**
 * プレイグラウンドのツールの中身（src/components/playground/tools/<slug>/）を、slug から読み込む。
 * ツールを足すときは、src/lib/playground/tools.ts に 1 件足して、このフォルダを作るだけでよい（ここは書き換えない）。
 *
 * フォルダの中身:
 * - index.tsx   … サーバーでも描くツールの入口（本体を default で export する）
 * - browser.tsx … ブラウザでだけ描くツールの入口（重いライブラリ・カメラ・Worker・今の時刻を使うもの）。
 *                 サーバー用のビルドでは import.meta.env.SSR で import ごと消えるので、Worker に入らない
 * - usage.ts    … 「使い方」（export const usage）
 * - after.tsx   … ツールの下に出す文章（あれば。仕様や注意書き。サーバーでも描く）
 * 入口は index.tsx か browser.tsx のどちらか 1 つだけ置く。ほかのファイルは本体から import する
 */

type ComponentModule = { default: React.ComponentType }
type Loader = () => Promise<ComponentModule>

/** './tools/<slug>/index.tsx' → slug */
function bySlug<T>(modules: Record<string, T>): Record<string, T> {
  return Object.fromEntries(
    Object.entries(modules).map(([path, mod]) => [path.split('/').at(-2), mod]),
  )
}

/** サーバーでも描くツール */
const serverTools = bySlug(
  import.meta.glob<ComponentModule>('./tools/*/index.tsx'),
)
/** ブラウザでだけ描くツール（サーバー用のビルドでは空） */
const browserTools: Record<string, Loader> = import.meta.env.SSR
  ? {}
  : bySlug(import.meta.glob<ComponentModule>('./tools/*/browser.tsx'))
/** ツールの下に出す文章 */
const afterModules = bySlug(
  import.meta.glob<ComponentModule>('./tools/*/after.tsx'),
)
/** 使い方（小さいので最初から読み込む） */
const usages = bySlug(
  import.meta.glob<ToolUsage>('./tools/*/usage.ts', {
    eager: true,
    import: 'usage',
  }),
)

/** ブラウザでだけ描くツールか（サーバーでもブラウザでも同じ答えになるよう、index.tsx があるかで決める） */
export const isBrowserOnly = (slug: string) => !(slug in serverTools)

export const toolUsage = (slug: string): ToolUsage | undefined => usages[slug]

type PartKind = 'tool' | 'after'

/** 読み込み終わった部品（サーバーでは、ルートの loader で読んでおいたものをそのまま描く） */
const loaded = new Map<string, React.ComponentType>()

async function load(part: PartKind, slug: string) {
  const key = `${part}:${slug}`
  const ready = loaded.get(key)
  if (ready) return ready
  const loader =
    part === 'after'
      ? afterModules[slug]
      : (serverTools[slug] ?? browserTools[slug])
  if (!loader) return undefined
  const component = (await loader()).default
  loaded.set(key, component)
  return component
}

/**
 * ルートの loader から呼ぶ。サーバーでも描くツールと下の文章は、読み込み終わるまで待つ
 * （サーバーは中身の入った HTML を返し、ページを移るときも読み込み中の枠を挟まずに出る）。
 * ブラウザでだけ描くツールは待たずに読み込みを始めるだけ（重いものもあるので、ページを先に出す）。
 * リンクにマウスを乗せただけのとき（preload）は、重いツールは読み込まない
 */
export async function preloadTool(slug: string, { preload = false } = {}) {
  const waits: Promise<unknown>[] = [load('after', slug)]
  if (!isBrowserOnly(slug)) waits.push(load('tool', slug))
  else if (!import.meta.env.SSR && !preload) void load('tool', slug)
  await Promise.all(waits)
}

const lazies = new Map<string, React.LazyExoticComponent<React.ComponentType>>()

/**
 * 部品を描く。読み込み済みならそのまま、まだなら lazy で読み込む。
 * サーバーで描いたページをブラウザが引き継ぐとき（ハイドレーション）は loader が走らないので、
 * lazy で待つあいだ、Suspense がサーバーの HTML をそのまま残す
 */
function Part({ part, slug }: { part: PartKind; slug: string }) {
  const key = `${part}:${slug}`
  const Ready = loaded.get(key)
  if (Ready) return <Ready />
  let Lazy = lazies.get(key)
  if (!Lazy) {
    Lazy = React.lazy(async () => ({
      default: (await load(part, slug)) ?? (() => null),
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
  if (!(slug in afterModules)) return null
  return (
    <React.Suspense fallback={null}>
      <Part part="after" slug={slug} />
    </React.Suspense>
  )
}
