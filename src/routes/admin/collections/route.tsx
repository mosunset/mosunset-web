import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/admin/collections')({
  staticData: { breadcrumb: 'コレクション' },
  component: Outlet,
})
