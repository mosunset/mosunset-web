import { Show, UserButton } from '@clerk/tanstack-react-start'
import { Link, useMatches } from '@tanstack/react-router'
import { Pencil } from 'lucide-react'

import {
  SiteSearchButton,
  SiteSearchIconButton,
} from '@/components/layout/site-search'
import { ThemeMenu } from '@/components/layout/theme-toggle'
import { Separator } from '@/components/ui/separator'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { resolveEditHref } from '@/lib/breadcrumbs'
import { mainNav } from '@/lib/navigation'
import { site } from '@/lib/site'

const navLinkClass =
  'rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground'

/**
 * ヘッダーの第一階層のリンク。今いる場所（その下のページも含む）は、
 * 文字を濃くして、ヘッダーの下の線に重ねて太い線を引く
 */
const sectionLinkClass =
  'relative flex items-center px-3 text-sm text-muted-foreground transition-colors hover:text-foreground after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:bg-transparent after:transition-colors data-[status=active]:font-medium data-[status=active]:text-foreground data-[status=active]:after:bg-foreground'

export function SiteHeader() {
  // 管理者が記事やコレクションのページを見ているときだけ、その編集画面へのリンクを出す
  const editHref = resolveEditHref(useMatches())

  return (
    <header className="sticky top-0 z-50 flex h-(--header-height) w-full shrink-0 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur">
      {/* 狭い画面ではメニューをサイドバー（ドロワー）で開く */}
      <SidebarTrigger className="-ml-1 lg:hidden" />
      <Separator
        orientation="vertical"
        className="mr-2 data-[orientation=vertical]:h-4 lg:hidden"
      />
      <Link to="/" className="flex items-center gap-2 font-semibold">
        <img
          src={site.image.path}
          alt=""
          width={28}
          height={28}
          className="size-7 rounded-full object-cover"
        />
        {site.name}
      </Link>

      <nav className="ml-auto hidden self-stretch lg:flex">
        {mainNav.map((item) => (
          <Link key={item.to} to={item.to} className={sectionLinkClass}>
            {item.title}
          </Link>
        ))}
      </nav>

      <div className="ml-auto flex items-center gap-1 lg:ml-2">
        <SiteSearchButton className="mr-1 hidden lg:inline-flex" />
        <SiteSearchIconButton className="lg:hidden" />
        <ThemeMenu />
        {editHref && (
          <Link
            to={editHref}
            aria-label="このページを編集"
            className={`${navLinkClass} inline-flex items-center gap-1.5`}
          >
            <Pencil className="size-4" />
            <span className="hidden sm:inline">編集</span>
          </Link>
        )}
        {/* 管理者がログインしているときだけ出す。公開側にはログインボタンを置かない */}
        <Show when="signed-in">
          <Link to="/admin" className={navLinkClass}>
            管理
          </Link>
          <UserButton />
        </Show>
      </div>
    </header>
  )
}
