import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/admin/posts')({
  staticData: { breadcrumb: 'ブログ記事' },
  component: Outlet,
})
