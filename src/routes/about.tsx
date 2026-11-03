import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/about')({
  staticData: { breadcrumb: 'このサイトについて' },
  component: About,
})

function About() {
  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold">このサイトについて</h1>
      <p className="mt-4 text-muted-foreground">ここにサイトの説明を書きます。</p>
    </div>
  )
}
