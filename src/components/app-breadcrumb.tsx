import { Link, useMatches } from '@tanstack/react-router'
import type { AnyRouteMatch } from '@tanstack/react-router'
import { Fragment } from 'react'

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'

declare module '@tanstack/react-router' {
  interface StaticDataRouteOption {
    /**
     * パンくずリストに表示するラベル。
     * 動的ルートでは関数にすると params や loaderData から生成できる。
     */
    breadcrumb?: string | ((match: AnyRouteMatch) => string | undefined)
  }
}

type Crumb = { label: string; pathname: string }

/** 現在マッチしているルートの staticData.breadcrumb からパンくずを組み立てる */
function useBreadcrumbs(): Crumb[] {
  const matches = useMatches()
  const crumbs: Crumb[] = []

  for (const match of matches) {
    const option = match.staticData.breadcrumb
    const label = typeof option === 'function' ? option(match) : option
    if (!label) continue

    // 末尾スラッシュの違いだけの重複（レイアウトと index など）は後勝ちにする
    const pathname = match.pathname.replace(/(.)\/$/, '$1')
    if (crumbs.at(-1)?.pathname === pathname) crumbs.pop()
    crumbs.push({ label, pathname })
  }

  return crumbs
}

export function AppBreadcrumb() {
  const crumbs = useBreadcrumbs()
  if (crumbs.length === 0) return null

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {crumbs.map((crumb, i) => {
          const isLast = i === crumbs.length - 1
          return (
            <Fragment key={crumb.pathname}>
              {i > 0 && <BreadcrumbSeparator />}
              <BreadcrumbItem>
                {isLast ? (
                  <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link to={crumb.pathname}>{crumb.label}</Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </Fragment>
          )
        })}
      </BreadcrumbList>
    </Breadcrumb>
  )
}
