import { createFileRoute, Link } from '@tanstack/react-router'
import { ImageOff, Plus } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { collections, imageUrl, itemSubtitle } from '@/lib/collections'
import { listItemsForAdmin } from '@/server/collections'

export const Route = createFileRoute('/admin/collections/$kind/')({
  loader: ({ params }) => listItemsForAdmin({ data: { kind: params.kind } }),
  component: AdminCollectionItems,
})

function AdminCollectionItems() {
  const { kind } = Route.useParams()
  const items = Route.useLoaderData()
  const config = collections[kind]

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-3xl font-bold">{config.label}</h1>
        <Button asChild>
          <Link to="/admin/collections/$kind/new" params={{ kind }}>
            <Plus />
            追加
          </Link>
        </Button>
      </div>

      {items.length === 0 ? (
        <p className="mt-8 rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          まだ登録されていません。「追加」から登録しましょう。
        </p>
      ) : (
        <ul className="mt-8 divide-y rounded-lg border">
          {items.map((item) => {
            const src = imageUrl(item.imageKey)
            const subtitle = itemSubtitle(kind, item.attributes)
            return (
              <li key={item.id}>
                <Link
                  to="/admin/collections/$kind/$id"
                  params={{ kind, id: item.id }}
                  className="flex items-center gap-4 px-4 py-3 hover:bg-muted/30"
                >
                  <div className="size-14 shrink-0 overflow-hidden rounded-md border bg-muted/30">
                    {src ? (
                      <img
                        src={src}
                        alt=""
                        className="size-full object-cover"
                      />
                    ) : (
                      <div className="flex size-full items-center justify-center text-muted-foreground">
                        <ImageOff className="size-4" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{item.title}</div>
                    <div className="truncate text-sm text-muted-foreground">
                      {subtitle || `${config.path}/${item.slug}`}
                    </div>
                  </div>
                  {item.published ? (
                    <Badge>公開</Badge>
                  ) : (
                    <Badge variant="secondary">非公開</Badge>
                  )}
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
