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
    to: '/admin/posts',
  },
  {
    title: 'コレクション',
    description: '楽器・資格・おもちゃ・本の登録（準備中）',
    icon: Library,
    to: undefined,
  },
  {
    title: 'お問い合わせ',
    description: 'フォームから届いたメッセージ（準備中）',
    icon: Inbox,
    to: undefined,
  },
] as const

function AdminHome() {
  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8">
      <h1 className="text-3xl font-bold">管理</h1>
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {sections.map((s) =>
          s.to ? (
            <Link key={s.title} to={s.to} className="group">
              <SectionCard section={s} />
            </Link>
          ) : (
            <div key={s.title}>
              <SectionCard section={s} />
            </div>
          ),
        )}
      </div>
      <p className="mt-8 text-sm text-muted-foreground">
        <Link to="/" className="underline">
          サイトに戻る
        </Link>
      </p>
    </div>
  )
}

function SectionCard({ section }: { section: (typeof sections)[number] }) {
  return (
    <Card
      className={
        section.to
          ? 'h-full transition-colors group-hover:bg-muted/50'
          : 'h-full opacity-60'
      }
    >
      <CardHeader>
        <section.icon className="mb-2 size-6 text-muted-foreground" />
        <CardTitle>{section.title}</CardTitle>
        <CardDescription>{section.description}</CardDescription>
      </CardHeader>
    </Card>
  )
}
