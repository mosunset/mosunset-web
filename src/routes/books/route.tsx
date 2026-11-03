import { createFileRoute, Outlet } from '@tanstack/react-router'

import { getNavItem } from '@/lib/navigation'

export const Route = createFileRoute('/books')({
  staticData: { breadcrumb: getNavItem('/books').title },
  component: Outlet,
})
