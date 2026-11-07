import { createFileRoute, Outlet } from '@tanstack/react-router'

import { getNavItem } from '@/lib/navigation'

export const Route = createFileRoute('/blog')({
  staticData: { breadcrumb: getNavItem('/blog').title },
  component: Outlet,
})
