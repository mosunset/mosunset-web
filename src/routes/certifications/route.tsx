import { createFileRoute, Outlet } from '@tanstack/react-router'

import { getNavItem } from '@/lib/navigation'

export const Route = createFileRoute('/certifications')({
  staticData: { breadcrumb: getNavItem('/certifications').title },
  component: Outlet,
})
