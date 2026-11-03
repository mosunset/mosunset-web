import { getRouteApi, Link, useMatchRoute } from '@tanstack/react-router'
import {
  ExternalLink,
  Inbox,
  LayoutDashboard,
  NotebookPen,
  SquarePen,
} from 'lucide-react'

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from '@/components/ui/sidebar'
import { collectionList } from '@/lib/collections'
import { getNavItem } from '@/lib/navigation'
import { site } from '@/lib/site'

const adminRoute = getRouteApi('/admin')

export function AdminSidebar() {
  const matchRoute = useMatchRoute()
  const { isMobile, setOpenMobile } = useSidebar()
  const { unreadCount } = adminRoute.useLoaderData()

  // スマホではページを移動したらメニューを閉じる
  const close = () => {
    if (isMobile) setOpenMobile(false)
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild size="lg" tooltip="ダッシュボード">
              <Link to="/admin" onClick={close}>
                <img
                  src={site.image.path}
                  alt=""
                  width={32}
                  height={32}
                  className="size-8 shrink-0 rounded-full object-cover"
                />
                <div className="grid leading-tight">
                  <span className="font-semibold">{site.name}</span>
                  <span className="text-xs text-muted-foreground">
                    管理画面
                  </span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  tooltip="ダッシュボード"
                  isActive={Boolean(matchRoute({ to: '/admin' }))}
                >
                  <Link to="/admin" onClick={close}>
                    <LayoutDashboard />
                    <span>ダッシュボード</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  tooltip="お問い合わせ"
                  isActive={Boolean(
                    matchRoute({ to: '/admin/messages', fuzzy: true }),
                  )}
                >
                  <Link to="/admin/messages" onClick={close}>
                    <Inbox />
                    <span>お問い合わせ</span>
                  </Link>
                </SidebarMenuButton>
                {unreadCount > 0 && (
                  <SidebarMenuBadge>{unreadCount}</SidebarMenuBadge>
                )}
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>ブログ</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  tooltip="記事一覧"
                  isActive={Boolean(
                    matchRoute({ to: '/admin/posts' }) ||
                      matchRoute({ to: '/admin/posts/$id' }),
                  )}
                >
                  <Link to="/admin/posts" onClick={close}>
                    <NotebookPen />
                    <span>記事一覧</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  tooltip="記事を書く"
                  isActive={Boolean(matchRoute({ to: '/admin/posts/new' }))}
                >
                  <Link to="/admin/posts/new" onClick={close}>
                    <SquarePen />
                    <span>記事を書く</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>コレクション</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {collectionList.map((c) => {
                const Icon = getNavItem(c.path).icon
                return (
                  <SidebarMenuItem key={c.kind}>
                    <SidebarMenuButton
                      asChild
                      tooltip={c.label}
                      isActive={Boolean(
                        matchRoute({
                          to: '/admin/collections/$kind',
                          params: { kind: c.kind },
                          fuzzy: true,
                        }),
                      )}
                    >
                      <Link
                        to="/admin/collections/$kind"
                        params={{ kind: c.kind }}
                        onClick={close}
                      >
                        <Icon />
                        <span>{c.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="サイトを見る">
              <a href="/" target="_blank" rel="noreferrer">
                <ExternalLink />
                <span>サイトを見る</span>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
