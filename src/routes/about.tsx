import { createFileRoute } from '@tanstack/react-router'

import { seo } from '@/lib/seo'

export const Route = createFileRoute('/about')({
  staticData: { breadcrumb: 'このサイトについて' },
  head: () => ({
    meta: seo({
      title: 'このサイトについて',
      description: 'mosunset について紹介するページです。',
    }),
  }),
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
