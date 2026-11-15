import { Link, type LinkProps, useRouterState } from '@tanstack/react-router'
import { ArrowLeft, Search } from 'lucide-react'
import type * as React from 'react'

import { setSiteSearchOpen } from '@/components/layout/site-search'
import { Button } from '@/components/ui/button'
import { mainNav } from '@/lib/navigation'

/**
 * 見つからないときのページ。
 * 戻り先（backTo）があればそこへのボタン、なければトップページへのボタンと各ページへのリンクを出す。
 * 公開側では、サイト内の検索も開けるようにする
 */
export function NotFoundPage({
  title,
  message,
  backTo,
  backLabel,
  width,
}: {
  title: string
  message: string
  backTo?: LinkProps['to']
  backLabel?: React.ReactNode
  /** ページの最大幅 */
  width: 'max-w-3xl' | 'max-w-5xl'
}) {
  // 管理画面には検索の画面が無い
  const isAdmin = useRouterState({
    select: (s) => s.location.pathname.startsWith('/admin'),
  })

  return (
    <div className={`mx-auto w-full ${width} px-6 py-12`}>
      <p className="text-sm font-medium text-muted-foreground">404</p>
      <h1 className="mt-1 text-3xl font-bold">{title}</h1>
      <p className="mt-4 text-muted-foreground">{message}</p>

      <div className="mt-6 flex flex-wrap gap-3">
        {backTo ? (
          <Button asChild>
            <Link to={backTo}>
              <ArrowLeft />
              {backLabel}
            </Link>
          </Button>
        ) : (
          <Button asChild>
            <Link to="/">トップページへ</Link>
          </Button>
        )}
        {!isAdmin && (
          <Button variant="outline" onClick={() => setSiteSearchOpen(true)}>
            <Search />
            サイト内を検索
          </Button>
        )}
      </div>

      {!backTo && !isAdmin && (
        <nav aria-label="各ページ" className="mt-12">
          <h2 className="text-sm font-medium text-muted-foreground">
            ほかのページ
          </h2>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {mainNav.map(({ to, title, description, icon: Icon }) => (
              <li key={to}>
                <Link
                  to={to}
                  className="flex h-full gap-3 rounded-lg border p-4 transition-colors hover:bg-muted/50"
                >
                  <Icon className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
                  <span>
                    <span className="block font-medium">{title}</span>
                    <span className="mt-1 block text-sm text-muted-foreground">
                      {description}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </div>
  )
}
