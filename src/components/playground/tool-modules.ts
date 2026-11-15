import type * as React from 'react'

/**
 * プレイグラウンドのツールの中身（src/components/playground/tools/<slug>/）を、slug から読み込む部分。
 * ルートの loader とブラウザの入口（src/client.tsx）からも使うので、軽く保つ
 * （画面の部品は tool-registry.tsx、使い方の文はそちらで読む）。
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
export function bySlug<T>(modules: Record<string, T>): Record<string, T> {
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

/** ブラウザでだけ描くツールか（サーバーでもブラウザでも同じ答えになるよう、index.tsx があるかで決める） */
export const isBrowserOnly = (slug: string) => !(slug in serverTools)

/** ツールの下に出す文章があるか */
export const hasAfter = (slug: string) => slug in afterModules

export type PartKind = 'tool' | 'after'

/** 読み込み終わった部品。読み込み済みなら、画面はこれをそのまま描く */
const loaded = new Map<string, React.ComponentType>()

export const loadedPart = (part: PartKind, slug: string) =>
  loaded.get(`${part}:${slug}`)

export async function loadPart(part: PartKind, slug: string) {
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
 * ルートの loader とブラウザの入口から呼ぶ。サーバーでも描くツールと下の文章は、読み込み終わるまで待つ
 * （サーバーは中身の入った HTML を返し、ページを移るときも読み込み中の枠を挟まずに出る）。
 * ブラウザでだけ描くツールは待たずに読み込みを始めるだけ（重いものもあるので、ページを先に出す）。
 * リンクにマウスを乗せただけのとき（preload）は、重いツールは読み込まない
 */
export async function preloadTool(slug: string, { preload = false } = {}) {
  const waits: Promise<unknown>[] = [loadPart('after', slug)]
  if (!isBrowserOnly(slug)) waits.push(loadPart('tool', slug))
  else if (!import.meta.env.SSR && !preload) void loadPart('tool', slug)
  await Promise.all(waits)
}

/**
 * ページを開いたとき、ブラウザがサーバーの表示を引き継ぐ（ハイドレーション）前に呼ぶ（src/client.tsx）。
 * 間に合わないと、React がサーバーで描いたツールを捨てて「読み込み中」を出し直し、表示がずれる
 */
export async function preloadToolForPath(pathname: string) {
  const match = pathname.match(/^\/playground\/([^/]+)\/?$/)
  if (!match) return
  const slug = decodeURIComponent(match[1])
  if (slug in serverTools || slug in browserTools) await preloadTool(slug)
}
