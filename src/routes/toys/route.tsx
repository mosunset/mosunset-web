import { createFileRoute, Outlet } from '@tanstack/react-router'

import { getNavItem } from '@/lib/navigation'

export const Route = createFileRoute('/toys')({
  staticData: { breadcrumb: getNavItem('/toys').title },
  component: Outlet,
})
