import { Outlet, createFileRoute } from '@tanstack/react-router'

// /test 以下すべての共通レイアウト
export const Route = createFileRoute('/test')({
  staticData: { breadcrumb: 'テスト' },
  component: () => <Outlet />,
})
