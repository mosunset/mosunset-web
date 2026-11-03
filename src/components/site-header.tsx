import { Show, UserButton } from '@clerk/tanstack-react-start'
import { Link } from '@tanstack/react-router'

import { Separator } from '@/components/ui/separator'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { mainNav } from '@/lib/navigation'
import { site } from '@/lib/site'

const navLinkClass =
  'rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground'

export function SiteHeader() {
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

      <nav className="ml-auto hidden items-center lg:flex">
        {mainNav.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className={navLinkClass}
            activeProps={{ className: 'font-medium text-foreground!' }}
          >
            {item.title}
          </Link>
        ))}
      </nav>

      {/* 管理者がログインしているときだけ出す。公開側にはログインボタンを置かない */}
      <Show when="signed-in">
        <div className="ml-auto flex items-center gap-3 lg:ml-4">
          <Link to="/admin" className={navLinkClass}>
            管理
          </Link>
          <UserButton />
        </div>
      </Show>
    </header>
  )
}
