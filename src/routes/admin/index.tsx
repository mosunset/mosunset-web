import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowRight, Inbox, NotebookPen, SquarePen } from 'lucide-react'
import type * as React from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { collectionList } from '@/lib/collections'
import { formatDateTime } from '@/lib/format'
import { getNavItem } from '@/lib/navigation'
import { cn } from '@/lib/utils'
import { getDashboard } from '@/server/dashboard'

export const Route = createFileRoute('/admin/')({
  loader: () => getDashboard(),
  component: AdminHome,
})

function AdminHome() {
  const data = Route.useLoaderData()

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold sm:text-3xl">ダッシュボード</h1>
        <Button asChild>
          <Link to="/admin/posts/new">
            <SquarePen />
            記事を書く
          </Link>
        </Button>
      </div>

      {/* 件数 */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat
          label="公開中の記事"
          value={data.posts.published}
          icon={NotebookPen}
          to="/admin/posts"
        />
        <Stat
          label="下書き"
          value={data.posts.draft}
          icon={SquarePen}
          to="/admin/posts"
        />
        {collectionList.map((c) => (
          <Stat
            key={c.kind}
            label={c.label}
            value={data.collections[c.kind] ?? 0}
            icon={getNavItem(c.path).icon}
            to="/admin/collections/$kind"
            params={{ kind: c.kind }}
          />
        ))}
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Panel
          title="最近の下書き"
          action={
            <Link
              to="/admin/posts"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              すべて
            </Link>
          }
        >
          {data.recentDrafts.length === 0 ? (
            <Empty>下書きはありません</Empty>
          ) : (
            <ul className="divide-y">
              {data.recentDrafts.map((post) => (
                <li key={post.id}>
                  <Link
                    to="/admin/posts/$id"
                    params={{ id: post.id }}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30"
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {post.title}
                    </span>
                    <time className="shrink-0 text-xs text-muted-foreground">
                      {formatDateTime(post.updatedAt)}
                    </time>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          title={
            <span className="flex items-center gap-2">
              最近のお問い合わせ
              {data.unreadMessages > 0 && (
                <Badge>未読 {data.unreadMessages}</Badge>
              )}
            </span>
          }
          action={
            <Link
              to="/admin/messages"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              すべて
            </Link>
          }
        >
          {data.recentMessages.length === 0 ? (
            <Empty>まだ届いていません</Empty>
          ) : (
            <ul className="divide-y">
              {data.recentMessages.map((m) => (
                <li key={m.id}>
                  <Link
                    to="/admin/messages/$id"
                    params={{ id: m.id }}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30"
                  >
                    <Inbox
                      className={cn(
                        'size-4 shrink-0',
                        m.readAt ? 'text-muted-foreground' : 'text-primary',
                      )}
                    />
                    <span
                      className={cn(
                        'min-w-0 flex-1 truncate',
                        !m.readAt && 'font-semibold',
                      )}
                    >
                      {m.subject || `${m.name} さんから`}
                    </span>
                    <time className="shrink-0 text-xs text-muted-foreground">
                      {formatDateTime(m.createdAt)}
                    </time>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        {collectionList.map((c) => (
          <Button key={c.kind} asChild variant="outline" size="sm">
            <Link to="/admin/collections/$kind/new" params={{ kind: c.kind }}>
              {c.label}を追加
            </Link>
          </Button>
        ))}
      </div>
    </div>
  )
}

function Stat({
  label,
  value,
  icon: Icon,
  ...link
}: {
  label: string
  value: number
  icon: React.ComponentType<{ className?: string }>
} & (
  | { to: '/admin/posts'; params?: undefined }
  | {
      to: '/admin/collections/$kind'
      params: { kind: (typeof collectionList)[number]['kind'] }
    }
)) {
  return (
    <Link
      {...link}
      className="group rounded-lg border p-3 transition-colors hover:bg-muted/40 sm:p-4"
    >
      <div className="flex items-center justify-between text-muted-foreground">
        <Icon className="size-4" />
        <ArrowRight className="size-3 opacity-0 transition-opacity group-hover:opacity-100" />
      </div>
      <div className="mt-2 text-2xl font-bold tabular-nums">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </Link>
  )
}

function Panel({
  title,
  action,
  children,
}: {
  title: React.ReactNode
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="rounded-lg border">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h2 className="font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-4 py-6 text-center text-sm text-muted-foreground">
      {children}
    </p>
  )
}
