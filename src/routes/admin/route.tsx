import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'

import { AdminShell } from '@/components/admin/admin-shell'
import { seo } from '@/lib/seo'
import { getAdminStatus } from '@/server/auth'
import { countUnreadMessages } from '@/server/contact'

export const Route = createFileRoute('/admin')({
  staticData: { breadcrumb: '管理' },
  head: () => ({ meta: seo({ title: '管理', noindex: true }) }),
  beforeLoad: async ({ location }) => {
    const admin = await getAdminStatus()
    if (admin.status === 'signed-out') {
      throw redirect({
        href: `/sign-in?redirect_url=${encodeURIComponent(location.href)}`,
      })
    }
    return { admin }
  },
  // 左メニューの未読バッジ用。管理者でなければ取得しない
  loader: async ({ context }) => ({
    unreadCount:
      context.admin.status === 'admin' ? await countUnreadMessages() : 0,
  }),
  component: AdminLayout,
})

function AdminLayout() {
  const { admin } = Route.useRouteContext()

  if (admin.status === 'forbidden') {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
        <h1 className="text-2xl font-bold">管理者として登録されていません</h1>
        <p className="mt-4 text-muted-foreground">
          このアカウントを管理者にするには、環境変数 <code>ADMIN_USER_IDS</code>{' '}
          に次のユーザー ID を追加して、サーバーを再起動してください。
        </p>
        <pre className="mt-4 rounded-md bg-muted p-4 text-sm">
          ADMIN_USER_IDS={admin.userId}
        </pre>
      </div>
    )
  }

  return (
    <AdminShell>
      <Outlet />
    </AdminShell>
  )
}
