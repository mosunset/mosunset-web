import type { AnyRouteMatch } from '@tanstack/react-router'

import { normalizePath } from '@/lib/seo'

declare module '@tanstack/react-router' {
  interface StaticDataRouteOption {
    /**
     * パンくずリストに表示するラベル。
     * 動的ルートでは関数にすると params や loaderData から生成できる。
     */
    breadcrumb?: string | ((match: AnyRouteMatch) => string | undefined)
  }
}

export type Crumb = { label: string; pathname: string }

/** マッチしているルートの staticData.breadcrumb からパンくずを組み立てる */
export function resolveBreadcrumbs(matches: AnyRouteMatch[]): Crumb[] {
  const crumbs: Crumb[] = []

  for (const match of matches) {
    const option = match.staticData?.breadcrumb
    const label = typeof option === 'function' ? option(match) : option
    if (!label) continue

    // 末尾スラッシュの違いだけの重複（レイアウトと index など）は後勝ちにする
    const pathname = normalizePath(match.pathname)
    if (crumbs.at(-1)?.pathname === pathname) crumbs.pop()
    crumbs.push({ label, pathname })
  }

  return crumbs
}
