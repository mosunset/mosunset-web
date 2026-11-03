import { createFileRoute, Link } from '@tanstack/react-router'
import { Inbox, Library, NotebookPen } from 'lucide-react'

import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

export const Route = createFileRoute('/admin/')({ component: AdminHome })

const sections = [
  {
    title: 'ブログ記事',
    description: '記事の作成・編集・公開',
    icon: NotebookPen,
  },
  {
    title: 'コレクション',
    description: '楽器・資格・おもちゃ・本の登録',
    icon: Library,
  },
  {
    title: 'お問い合わせ',
    description: 'フォームから届いたメッセージ',
    icon: Inbox,
  },
] as const

function AdminHome() {
  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8">
      <h1 className="text-3xl font-bold">管理</h1>
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {sections.map((s) => (
          <Card key={s.title} className="opacity-60">
            <CardHeader>
              <s.icon className="mb-2 size-6 text-muted-foreground" />
              <CardTitle>{s.title}</CardTitle>
              <CardDescription>{s.description}（準備中）</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </div>
      <p className="mt-8 text-sm text-muted-foreground">
        <Link to="/" className="underline">
          サイトに戻る
        </Link>
      </p>
    </div>
  )
}
