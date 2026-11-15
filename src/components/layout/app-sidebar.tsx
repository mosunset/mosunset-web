import { Link, useMatchRoute } from '@tanstack/react-router'
import { House } from 'lucide-react'
import type * as React from 'react'

import { SectionContents } from '@/components/layout/section-contents'
import { SocialIcon } from '@/components/layout/social-icons'
import { ThemeSwitch } from '@/components/layout/theme-toggle'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar'
import { contactNav, getNavItem, navGroups } from '@/lib/navigation'
import { site } from '@/lib/site'

/** 狭い画面のメニュー（ヘッダーの ☰ で開く） */
export function AppSidebar(props: React.ComponentProps<typeof Sidebar>) {
  const matchRoute = useMatchRoute()
  const { isMobile, setOpen, setOpenMobile } = useSidebar()

  // ページを移動したらメニューを閉じる（必要なときだけ出す）
  const close = () => (isMobile ? setOpenMobile(false) : setOpen(false))

  return (
    <Sidebar role="navigation" aria-label="サイトのメニュー" {...props}>
      {/* スマホでは画面の端から端まで覆うので、ヘッダーの代わりに名前を出す（それより広いとヘッダーの下に出る） */}
      <SidebarHeader className="md:hidden">
        <Link
          to="/"
          onClick={close}
          className="flex items-center gap-3 rounded-md p-2 hover:bg-sidebar-accent"
        >
          <img
            src={site.icon.small}
            alt=""
            width={36}
            height={36}
            className="size-9 rounded-full object-cover"
          />
          <span className="grid leading-tight">
            <span className="font-semibold">{site.name}</span>
            <span className="text-xs text-muted-foreground">
              {site.tagline}
            </span>
          </span>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={Boolean(matchRoute({ to: '/' }))}
                >
                  <Link to="/" onClick={close}>
                    <House />
                    <span>ホーム</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {navGroups.map((group) => (
          <SidebarGroup key={group.label} className="py-1">
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.paths.map((path) => {
                  const item = getNavItem(path)
                  const active = Boolean(matchRoute({ to: path, fuzzy: true }))
                  return (
                    <SidebarMenuItem key={path}>
                      <SidebarMenuButton asChild size="lg" isActive={active}>
                        <Link to={path} onClick={close}>
                          <item.icon />
                          <span className="grid min-w-0 leading-tight">
                            <span className="truncate">{item.title}</span>
                            <span className="truncate text-xs font-normal text-muted-foreground">
                              {item.description}
                            </span>
                          </span>
                        </Link>
                      </SidebarMenuButton>
                      {/* 今いる場所の中身（道具の一覧・最近の記事・分類など） */}
                      {active && (
                        <SectionContents path={path} onNavigate={close} />
                      )}
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="gap-3 border-t p-3">
        <ThemeSwitch />
        <div className="flex items-center gap-1 text-sm text-muted-foreground">
          {site.social.map((s) => (
            <a
              key={s.name}
              href={s.url}
              target="_blank"
              rel="noopener noreferrer me"
              aria-label={s.name}
              className="rounded-md p-2 hover:bg-sidebar-accent hover:text-foreground"
            >
              <SocialIcon name={s.name} className="size-4" />
            </a>
          ))}
          <Link
            to={contactNav.to}
            onClick={close}
            className="ml-auto inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 hover:bg-sidebar-accent hover:text-foreground"
          >
            <contactNav.icon className="size-4" />
            {contactNav.title}
          </Link>
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}
