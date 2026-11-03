import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/admin/messages')({
  staticData: { breadcrumb: 'お問い合わせ' },
  component: Outlet,
})
