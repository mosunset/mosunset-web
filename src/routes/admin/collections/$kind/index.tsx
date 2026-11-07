import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { GripVertical, ImageOff, Plus } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

import { AdminPage } from '@/components/admin/admin-page'
import { ListFilter, matchesQuery } from '@/components/admin/list-filter'
import { EmptyState } from '@/components/empty-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { listItemsForAdmin, reorderItems } from '@/functions/collections'
import {
  type CollectionKind,
  collections,
  itemSubtitle,
} from '@/lib/collections'
import { errorMessage } from '@/lib/errors'
import { imageUrl } from '@/lib/images'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/admin/collections/$kind/')({
  loader: ({ params }) => listItemsForAdmin({ data: { kind: params.kind } }),
  component: AdminCollectionItems,
})

type Item = Awaited<ReturnType<typeof listItemsForAdmin>>[number]
type Filter = 'all' | 'published' | 'hidden'

const filterOptions = [
  { value: 'all', label: 'すべて' },
  { value: 'published', label: '公開' },
  { value: 'hidden', label: '非公開' },
] as const

function AdminCollectionItems() {
  const { kind } = Route.useParams()
  const loaded = Route.useLoaderData()
  const config = collections[kind]
  const router = useRouter()
  const reorder = useServerFn(reorderItems)

  const [items, setItems] = useState(loaded)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  useEffect(() => setItems(loaded), [loaded])

  const visible = useMemo(
    () =>
      items.filter(
        (item) =>
          (filter === 'all' ||
            (filter === 'published' ? item.published : !item.published)) &&
          matchesQuery(
            query,
            item.title,
            item.slug,
            ...Object.values(item.attributes),
          ),
      ),
    [items, query, filter],
  )
  // 絞り込み中は見えていないものとの前後関係がわからないので、並び替えは全件表示のときだけ
  const canReorder = query.trim() === '' && filter === 'all' && items.length > 1

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    // スマホでは長押しで並び替え（スクロールと区別する）
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 6 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  const onDragEnd = async ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    const before = items
    const from = items.findIndex((i) => i.id === active.id)
    const to = items.findIndex((i) => i.id === over.id)
    const next = arrayMove(items, from, to)
    setItems(next)
    try {
      await reorder({ data: { kind, ids: next.map((i) => i.id) } })
      toast.success('並び順を保存しました')
      router.invalidate()
    } catch (e) {
      setItems(before)
      toast.error(errorMessage(e, '並び順を保存できませんでした'))
    }
  }

  return (
    <AdminPage
      title={config.label}
      action={
        <Button asChild>
          <Link to="/admin/collections/$kind/new" params={{ kind }}>
            <Plus />
            追加
          </Link>
        </Button>
      }
    >
      {items.length === 0 ? (
        <EmptyState className="mt-8">
          まだ登録されていません。「追加」から登録しましょう。
        </EmptyState>
      ) : (
        <>
          <div className="mt-6">
            <ListFilter
              query={query}
              onQueryChange={setQuery}
              filter={filter}
              onFilterChange={setFilter}
              options={filterOptions}
              placeholder={`${config.label}を検索（名前・${config.fields
                .map((f) => f.label)
                .slice(0, 2)
                .join('・')}など）`}
            />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            {visible.length} / {items.length} 件
            {canReorder
              ? '・左のつまみをドラッグして並び替え（スマホは長押し）'
              : items.length > 1
                ? '・並び替えは検索・絞り込みを解除すると使えます'
                : ''}
          </p>

          {visible.length === 0 ? (
            <EmptyState className="mt-4">
              条件に合うものがありません。
            </EmptyState>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={onDragEnd}
            >
              <SortableContext
                items={visible.map((i) => i.id)}
                strategy={verticalListSortingStrategy}
                disabled={!canReorder}
              >
                <ul className="mt-2 divide-y rounded-lg border">
                  {visible.map((item) => (
                    <SortableRow
                      key={item.id}
                      kind={kind}
                      item={item}
                      draggable={canReorder}
                    />
                  ))}
                </ul>
              </SortableContext>
            </DndContext>
          )}
        </>
      )}
    </AdminPage>
  )
}

function SortableRow({
  kind,
  item,
  draggable,
}: {
  kind: CollectionKind
  item: Item
  draggable: boolean
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id, disabled: !draggable })
  const src = imageUrl(item.imageKey)
  const subtitle = itemSubtitle(kind, item.attributes)

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'flex items-center bg-background',
        isDragging && 'relative z-10 shadow-lg ring-1 ring-ring/30',
      )}
    >
      {draggable && (
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label={`${item.title} を並び替える`}
          className="flex h-full cursor-grab touch-none items-center self-stretch px-2 text-muted-foreground hover:text-foreground active:cursor-grabbing"
        >
          <GripVertical className="size-4" />
        </button>
      )}
      <Link
        to="/admin/collections/$kind/$id"
        params={{ kind, id: item.id }}
        className={cn(
          'flex min-w-0 flex-1 items-center gap-3 py-3 pr-4 hover:bg-muted/30 sm:gap-4',
          !draggable && 'pl-4',
        )}
      >
        <div className="size-12 shrink-0 overflow-hidden rounded-md border bg-muted/30 sm:size-14">
          {src ? (
            <img
              src={src}
              alt=""
              loading="lazy"
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
            {subtitle || `${collections[kind].path}/${item.slug}`}
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
}
