import { Outlet, createFileRoute } from '@tanstack/react-router'

import { seo } from '@/lib/seo'

// /test 以下すべての共通レイアウト
export const Route = createFileRoute('/test')({
  staticData: { breadcrumb: 'テスト' },
  // テスト用なので配下のページもまとめて検索結果に載せない
  head: () => ({ meta: seo({ title: 'テスト', noindex: true }) }),
  component: () => <Outlet />,
})
