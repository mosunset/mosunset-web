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
import { GripVertical, ImageOff, ListChecks, Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { AdminPage } from '@/components/admin/admin-page'
import { ListFilter } from '@/components/admin/list-filter'
import { EmptyState } from '@/components/common/empty-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  listItemsForAdmin,
  reorderItems,
  setItemsPublished,
} from '@/functions/collections'
import { useListFilter } from '@/hooks/admin/use-list-filter'
import {
  type CollectionKind,
  collections,
  isDisplayedField,
  itemSubtitle,
  relatedKeysOf,
} from '@/lib/collections/config'
import { errorMessage } from '@/lib/errors'
import { thumbnailUrl } from '@/lib/images'
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

const listFilterOptions = {
  initialFilter: 'all' as Filter,
  matchesFilter: (item: Item, filter: Filter) =>
    filter === 'all' ||
    (filter === 'published' ? item.published : !item.published),
  searchText: (item: Item) => [
    item.title,
    item.slug,
    ...Object.values(item.attributes),
  ],
}

function AdminCollectionItems() {
  const { kind } = Route.useParams()
  const loaded = Route.useLoaderData()
  const config = collections[kind]
  const router = useRouter()
  const reorder = useServerFn(reorderItems)

  const [items, setItems] = useState(loaded)
  useEffect(() => setItems(loaded), [loaded])

  const { query, filter, visible, filterProps } = useListFilter(
    items,
    listFilterOptions,
  )

  // まとめて公開・非公開にするために選んでいるもの（選んでいるあいだは並び替えない）
  const setPublished = useServerFn(setItemsPublished)
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [applying, setApplying] = useState(false)
  // 選んだもののうち、今の絞り込みで見えているもの（見えていないものは操作しない）
  const selectedVisible = visible.filter((i) => selected.has(i.id))
  const allVisibleSelected =
    visible.length > 0 && selectedVisible.length === visible.length
  const toggle = (id: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  const stopSelecting = () => {
    setSelecting(false)
    setSelected(new Set())
  }
  const applyPublished = async (published: boolean) => {
    const targets = selectedVisible.filter((i) => i.published !== published)
    if (targets.length === 0) {
      toast.info(
        published ? 'どれも公開になっています' : 'どれも非公開になっています',
      )
      return
    }
    const message = published
      ? `${targets.length} 件を公開します。公開ページに出るようになります。`
      : `${targets.length} 件を非公開にします。公開ページから見えなくなります。`
    if (!window.confirm(message)) return
    setApplying(true)
    try {
      await setPublished({
        data: { kind, ids: targets.map((i) => i.id), published },
      })
      toast.success(
        `${targets.length} 件を${published ? '公開' : '非公開に'}しました`,
      )
      stopSelecting()
      router.invalidate()
    } catch (e) {
      toast.error(errorMessage(e, 'まとめて変えられませんでした'))
    } finally {
      setApplying(false)
    }
  }

  // 絞り込み中は見えていないものとの前後関係がわからないので、並び替えは全件表示のときだけ
  const canReorder =
    !selecting && query.trim() === '' && filter === 'all' && items.length > 1
  // 同じ作品などのものは近くに寄せて並べる（src/lib/collections/order.ts）。ほかのまとまりの中へ動かしても戻る
  const relatedLabels = relatedKeysOf(kind)
    .map((key) => config.fields.find((f) => f.key === key)?.label)
    .filter(Boolean)
    .map((label) => `「${label}」`)
    .join('')

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
              {...filterProps}
              options={filterOptions}
              placeholder={`${config.label}を検索（名前・${config.fields
                .filter(isDisplayedField)
                .map((f) => f.label)
                .slice(0, 2)
                .join('・')}など）`}
            />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
            <p className="text-xs text-muted-foreground">
              {visible.length} / {items.length} 件
              {selecting
                ? `・${selectedVisible.length} 件を選んでいます`
                : canReorder
                  ? `・左のつまみをドラッグして並び替え（スマホは長押し）${relatedLabels ? `。同じ${relatedLabels}のものは近くにまとまります` : ''}`
                  : items.length > 1
                    ? '・並び替えは検索・絞り込みを解除すると使えます'
                    : ''}
            </p>
            {!selecting && (
              <Button
                variant="outline"
                size="sm"
                className="ml-auto"
                onClick={() => setSelecting(true)}
              >
                <ListChecks />
                まとめて公開・非公開
              </Button>
            )}
          </div>

          {selecting && (
            <div className="sticky top-(--header-height) z-10 mt-2 flex flex-wrap items-center gap-2 rounded-lg border bg-background/95 p-2 shadow-sm backdrop-blur">
              <label className="flex items-center gap-2 px-1 text-sm">
                <input
                  type="checkbox"
                  className="size-4"
                  checked={allVisibleSelected}
                  onChange={(e) =>
                    setSelected(
                      e.target.checked
                        ? new Set(visible.map((i) => i.id))
                        : new Set(),
                    )
                  }
                />
                表示中のものをすべて選ぶ
              </label>
              <div className="ml-auto flex flex-wrap gap-2">
                <Button
                  size="sm"
                  disabled={applying || selectedVisible.length === 0}
                  onClick={() => applyPublished(true)}
                >
                  公開にする
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={applying || selectedVisible.length === 0}
                  onClick={() => applyPublished(false)}
                >
                  非公開にする
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={applying}
                  onClick={stopSelecting}
                >
                  やめる
                </Button>
              </div>
            </div>
          )}

          {visible.length === 0 ? (
            <EmptyState className="mt-4">
              条件に合うものがありません。
            </EmptyState>
          ) : (
            <DndContext
              // 決まった id を渡さないと、つまみの aria-describedby の番号がサーバーとブラウザでずれる
              id="admin-collection-items"
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
                      selection={
                        selecting
                          ? {
                              checked: selected.has(item.id),
                              onChange: (on) => toggle(item.id, on),
                            }
                          : undefined
                      }
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
  selection,
}: {
  kind: CollectionKind
  item: Item
  draggable: boolean
  /** まとめて操作するために選んでいるあいだだけ渡す（行を押すと選ぶ・外す） */
  selection?: { checked: boolean; onChange: (checked: boolean) => void }
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
  const src = thumbnailUrl(item.imageKey)
  const subtitle = itemSubtitle(kind, item.attributes)

  const content = (
    <>
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
    </>
  )

  if (selection) {
    return (
      <li className={cn('bg-background', selection.checked && 'bg-muted/40')}>
        <label className="flex cursor-pointer items-center gap-3 py-3 pr-4 pl-3 hover:bg-muted/30 sm:gap-4">
          <input
            type="checkbox"
            className="size-4 shrink-0"
            checked={selection.checked}
            onChange={(e) => selection.onChange(e.target.checked)}
          />
          {content}
        </label>
      </li>
    )
  }

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
        {content}
      </Link>
    </li>
  )
}
