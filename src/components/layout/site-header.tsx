import { Show, UserButton } from '@clerk/tanstack-react-start'
import { Link, useMatches, useMatchRoute } from '@tanstack/react-router'
import { ChevronDown, LayoutDashboard, Pencil } from 'lucide-react'

import {
  SiteSearchButton,
  SiteSearchIconButton,
} from '@/components/layout/site-search'
import { ThemeMenu } from '@/components/layout/theme-toggle'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Separator } from '@/components/ui/separator'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { resolveEditHref } from '@/lib/breadcrumbs'
import { collectionNav, mainNav } from '@/lib/navigation'
import { site } from '@/lib/site'
import { cn } from '@/lib/utils'

const navLinkClass =
  'inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground [&_svg]:size-4'

/**
 * ヘッダーの第一階層のリンク。今いる場所（その下のページも含む）は、
 * 文字を濃くして、ヘッダーの下の線に重ねて太い線を引く
 */
const sectionLinkClass =
  'relative flex items-center px-3 text-sm whitespace-nowrap text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:text-foreground focus-visible:underline after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:bg-transparent after:transition-colors data-[status=active]:font-medium data-[status=active]:text-foreground data-[status=active]:after:bg-foreground'

const isCollection = (to: string) => collectionNav.some((c) => c.to === to)

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
      <Link to="/" className="flex shrink-0 items-center gap-2 font-semibold">
        <img
          src={site.image.path}
          alt=""
          width={28}
          height={28}
          className="size-7 rounded-full object-cover"
        />
        {site.name}
      </Link>

      {/*
        タブレットの幅（md〜lg）では、コレクションの 4 つを「コレクション」1 つにまとめて並べる。
        それより広ければ全部を横に並べ、スマホでは ☰ のメニューにしまう
      */}
      <nav className="ml-auto hidden self-stretch md:flex">
        {mainNav.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className={cn(
              sectionLinkClass,
              isCollection(item.to) && 'hidden lg:flex',
            )}
          >
            {item.title}
          </Link>
        ))}
        <CollectionMenu className="lg:hidden" />
      </nav>

      <div className="ml-auto flex items-center gap-1 md:ml-2">
        <SiteSearchButton className="mr-1 hidden lg:inline-flex" />
        <SiteSearchIconButton className="lg:hidden" />
        <ThemeMenu />
        {editHref && (
          <Link
            to={editHref}
            aria-label="このページを編集"
            className={navLinkClass}
          >
            <Pencil />
            <span className="hidden lg:inline">編集</span>
          </Link>
        )}
        {/* 管理者がログインしているときだけ出す。公開側にはログインボタンを置かない */}
        <Show when="signed-in">
          <Link to="/admin" aria-label="管理画面" className={navLinkClass}>
            <LayoutDashboard className="lg:hidden" />
            <span className="hidden lg:inline">管理</span>
          </Link>
          <UserButton />
        </Show>
      </div>
    </header>
  )
}

/** 楽器・資格・おもちゃ・本をまとめたメニュー（タブレットの幅用） */
function CollectionMenu({ className }: { className?: string }) {
  const matchRoute = useMatchRoute()
  const active = collectionNav.some((item) =>
    matchRoute({ to: item.to, fuzzy: true }),
  )

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        data-status={active ? 'active' : undefined}
        className={cn(sectionLinkClass, 'gap-1', className)}
      >
        コレクション
        <ChevronDown className="size-3.5 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        {collectionNav.map((item) => (
          <DropdownMenuItem key={item.to} asChild>
            <Link
              to={item.to}
              className="items-start data-[status=active]:bg-accent/60 data-[status=active]:font-medium"
            >
              <item.icon className="mt-0.5" />
              <span className="grid">
                <span>{item.title}</span>
                <span className="text-xs font-normal text-muted-foreground">
                  {item.description}
                </span>
              </span>
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
