import { createFileRoute, Link } from '@tanstack/react-router'
import { Inbox, Library, NotebookPen } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { countUnreadMessages } from '@/server/contact'

export const Route = createFileRoute('/admin/')({
  loader: () => countUnreadMessages(),
  component: AdminHome,
})

const sections = [
  {
    title: 'ブログ記事',
    description: '記事の作成・編集・公開',
    icon: NotebookPen,
    to: '/admin/posts',
  },
  {
    title: 'コレクション',
    description: '楽器・資格・おもちゃ・本の登録',
    icon: Library,
    to: '/admin/collections',
  },
  {
    title: 'お問い合わせ',
    description: 'フォームから届いたメッセージ',
    icon: Inbox,
    to: '/admin/messages',
  },
] as const

function AdminHome() {
  const unread = Route.useLoaderData()

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8">
      <h1 className="text-3xl font-bold">管理</h1>
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {sections.map((s) => (
          <Link key={s.title} to={s.to} className="group">
            <Card className="h-full transition-colors group-hover:bg-muted/50">
              <CardHeader>
                <s.icon className="mb-2 size-6 text-muted-foreground" />
                <CardTitle className="flex items-center gap-2">
                  {s.title}
                  {s.to === '/admin/messages' && unread > 0 && (
                    <Badge>未読 {unread}</Badge>
                  )}
                </CardTitle>
                <CardDescription>{s.description}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
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
