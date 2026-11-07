import { createFileRoute, Link } from '@tanstack/react-router'

import { AdminPage } from '@/components/admin/admin-page'
import { EmptyState } from '@/components/empty-state'
import { Badge } from '@/components/ui/badge'
import { formatDateTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import { listMessages } from '@/server/contact'

export const Route = createFileRoute('/admin/messages/')({
  loader: () => listMessages(),
  component: AdminMessages,
})

function AdminMessages() {
  const messages = Route.useLoaderData()
  const unread = messages.filter((m) => !m.readAt).length

  return (
    <AdminPage title="お問い合わせ">
      <p className="mt-2 text-sm text-muted-foreground">
        {messages.length} 件（未読 {unread} 件）
      </p>

      {messages.length === 0 ? (
        <EmptyState className="mt-8">まだ届いていません。</EmptyState>
      ) : (
        <ul className="mt-8 divide-y rounded-lg border">
          {messages.map((m) => (
            <li key={m.id}>
              <Link
                to="/admin/messages/$id"
                params={{ id: m.id }}
                className="flex items-start gap-4 px-4 py-3 hover:bg-muted/30"
              >
                <span
                  className={cn(
                    'mt-2 size-2 shrink-0 rounded-full',
                    m.readAt ? 'bg-transparent' : 'bg-primary',
                  )}
                  aria-hidden="true"
                />
                <span className="sr-only">{m.readAt ? '既読' : '未読'}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn('truncate', !m.readAt && 'font-semibold')}
                    >
                      {m.subject || '（件名なし）'}
                    </span>
                    {!m.readAt && <Badge>未読</Badge>}
                  </div>
                  <div className="truncate text-sm text-muted-foreground">
                    {m.name} &lt;{m.email}&gt; — {m.body}
                  </div>
                </div>
                <time className="shrink-0 text-xs text-muted-foreground">
                  {formatDateTime(m.createdAt)}
                </time>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </AdminPage>
  )
}
