import { Link, useMatches } from '@tanstack/react-router'
import { type ComponentProps, Fragment } from 'react'

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'

import { resolveBreadcrumbs } from '@/lib/breadcrumbs'
import { useRememberedListSearch } from '@/lib/list-memory'

/** 一覧ページへのパンくずは、その一覧で最後に使った絞り込みを付けて戻る */
function CrumbLink({ to, ...props }: { to: string } & ComponentProps<'a'>) {
  const search = useRememberedListSearch(to)
  // 行き先はどの一覧か決まっていないので、search の型は見ない
  return <Link to={to} search={(search ?? {}) as never} {...props} />
}

/**
 * パンくず。minDepth 段より浅いページでは出さない
 * （公開側は 3。「ホーム > ブログ」はヘッダーやページの見出しと同じことしか言わないので、一覧ページでは出さない）
 */
export function AppBreadcrumb({
  className,
  minDepth = 2,
}: {
  className?: string
  minDepth?: number
}) {
  const crumbs = resolveBreadcrumbs(useMatches())
  if (crumbs.length < minDepth) return null

  return (
    <Breadcrumb className={className}>
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
                    <CrumbLink to={crumb.pathname}>{crumb.label}</CrumbLink>
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
