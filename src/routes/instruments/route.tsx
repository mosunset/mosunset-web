import { createFileRoute, Outlet } from '@tanstack/react-router'

import { getNavItem } from '@/lib/navigation'

export const Route = createFileRoute('/instruments')({
  staticData: { breadcrumb: getNavItem('/instruments').title },
  component: Outlet,
})
