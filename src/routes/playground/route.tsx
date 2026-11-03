import { createFileRoute, Outlet } from '@tanstack/react-router'

import { getNavItem } from '@/lib/navigation'

export const Route = createFileRoute('/playground')({
  staticData: { breadcrumb: getNavItem('/playground').title },
  component: Outlet,
})
