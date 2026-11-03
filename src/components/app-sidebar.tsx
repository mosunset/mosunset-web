import { Link, useMatchRoute } from '@tanstack/react-router'
import { House } from 'lucide-react'
import type * as React from 'react'

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar'
import { mainNav } from '@/lib/navigation'

const navItems = [
  { title: 'ホーム', to: '/', icon: House },
  ...mainNav,
] as const

export function AppSidebar(props: React.ComponentProps<typeof Sidebar>) {
  const matchRoute = useMatchRoute()
  const { isMobile, setOpen, setOpenMobile } = useSidebar()

  // ページを移動したらメニューを閉じる（必要なときだけ出す）
  const close = () => (isMobile ? setOpenMobile(false) : setOpen(false))

  return (
    <Sidebar {...props}>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>メニュー</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.to}>
                  <SidebarMenuButton
                    asChild
                    isActive={Boolean(
                      matchRoute({ to: item.to, fuzzy: item.to !== '/' }),
                    )}
                  >
                    <Link to={item.to} onClick={close}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  )
}
