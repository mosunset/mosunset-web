import { Link, createFileRoute } from '@tanstack/react-router'

import { testItems } from './-data'

export const Route = createFileRoute('/test/')({ component: TestIndex })

function TestIndex() {
  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold">テストページ</h1>
      <p className="mt-4 text-muted-foreground">
        パンくずリストの動作確認用のページです。下のリンクから階層をたどってみてください。
      </p>

      <h2 className="mt-8 text-xl font-semibold">アイテム（動的ルート）</h2>
      <ul className="mt-2 list-disc pl-6">
        {testItems.map((item) => (
          <li key={item.id}>
            <Link to="/test/$id" params={{ id: item.id }} className="underline">
              {item.name}
            </Link>
          </li>
        ))}
      </ul>

      <h2 className="mt-8 text-xl font-semibold">静的ルート</h2>
      <ul className="mt-2 list-disc pl-6">
        <li>
          <Link to="/test/settings" className="underline">
            設定
          </Link>
        </li>
      </ul>
    </div>
  )
}
