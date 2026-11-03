import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/blog')({
  staticData: { breadcrumb: 'ブログ' },
  component: Outlet,
})
