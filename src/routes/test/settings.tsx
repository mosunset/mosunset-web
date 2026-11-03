import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/test/settings')({
  staticData: { breadcrumb: '設定' },
  component: TestSettings,
})

function TestSettings() {
  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold">設定</h1>
      <p className="mt-4 text-muted-foreground">静的なラベルのパンくずの例です。</p>
    </div>
  )
}
