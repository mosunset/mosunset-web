import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { Mail, MailOpen, Reply, Trash2 } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { errorMessage } from '@/lib/errors'
import { formatDateTime } from '@/lib/format'
import { site } from '@/lib/site'
import { deleteMessage, getMessage, markMessageUnread } from '@/server/contact'

export const Route = createFileRoute('/admin/messages/$id')({
  loader: ({ params }) => getMessage({ data: { id: params.id } }),
  staticData: {
    breadcrumb: (match) =>
      match.loaderData ? match.loaderData.subject || '（件名なし）' : undefined,
  },
  component: MessageDetail,
})

function MessageDetail() {
  const message = Route.useLoaderData()
  const router = useRouter()
  const remove = useServerFn(deleteMessage)
  const markUnread = useServerFn(markMessageUnread)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = async (fn: () => Promise<unknown>) => {
    setPending(true)
    setError(null)
    try {
      await fn()
      await router.navigate({ to: '/admin/messages' })
    } catch (e) {
      setError(errorMessage(e, '処理できませんでした'))
      setPending(false)
    }
  }

  const replyHref = `mailto:${encodeURIComponent(message.email)}?subject=${encodeURIComponent(
    `Re: ${message.subject || `${site.name} へのお問い合わせ`}`,
  )}`

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      <h1 className="text-2xl font-bold">
        {message.subject || '（件名なし）'}
      </h1>
      <dl className="mt-4 grid grid-cols-[6rem_1fr] gap-y-1 text-sm">
        <dt className="text-muted-foreground">名前</dt>
        <dd>{message.name}</dd>
        <dt className="text-muted-foreground">メール</dt>
        <dd>{message.email}</dd>
        <dt className="text-muted-foreground">受信日時</dt>
        <dd>{formatDateTime(message.createdAt)}</dd>
      </dl>

      <div className="mt-6 whitespace-pre-wrap rounded-lg border bg-muted/20 p-4 leading-relaxed">
        {message.body}
      </div>

      {error && <p className="mt-4 text-sm text-destructive">{error}</p>}

      <div className="mt-6 flex flex-wrap gap-2">
        <Button asChild>
          <a href={replyHref}>
            <Reply />
            メールで返信
          </a>
        </Button>
        <Button
          variant="outline"
          disabled={pending}
          onClick={() => run(() => markUnread({ data: { id: message.id } }))}
        >
          <Mail />
          未読に戻す
        </Button>
        <Button
          variant="ghost"
          className="ml-auto text-destructive hover:text-destructive"
          disabled={pending}
          onClick={() => {
            if (
              window.confirm('このお問い合わせを削除します。元に戻せません。')
            ) {
              run(() => remove({ data: { id: message.id } }))
            }
          }}
        >
          <Trash2 />
          削除
        </Button>
      </div>
      <p className="mt-8 flex items-center gap-1 text-xs text-muted-foreground">
        <MailOpen className="size-3" />
        開いた時点で既読になります
      </p>
    </div>
  )
}
