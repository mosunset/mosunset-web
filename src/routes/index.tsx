import { createFileRoute } from '@tanstack/react-router'

import { Button } from '@/components/ui/button'

export const Route = createFileRoute('/')({ component: Home })

function Home() {
  return (
    <div className="p-8">
      <h1 className="text-4xl font-bold">TanStack Start へようこそ</h1>
      <p className="mt-4 text-lg">
        <code>src/routes/index.tsx</code> を編集して始めましょう。
      </p>
      <Button className="mt-6">shadcn/ui のボタン</Button>
    </div>
  )
}
