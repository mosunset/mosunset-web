import { Link, useNavigate } from '@tanstack/react-router'
import { ChevronLeft, ChevronRight, ExternalLink, ImageOff } from 'lucide-react'
import * as React from 'react'

import { BackLinkFooter } from '@/components/back-link-footer'
import { DraftBadge } from '@/components/draft-badge'
import { EmptyState } from '@/components/empty-state'
import { RichTextContent, ZoomableImage } from '@/components/image-viewer'
import { NewBadge, StatusBadge } from '@/components/item-badges'
import {
  type Facet,
  FilterValue,
  type Group,
  GroupedSections,
  groupItems,
  type ListControls,
  type ListSearch,
  ListToolbar,
  NoMatches,
  SortableHeader,
  type SortColumn,
  TableGroupRow,
  useList,
  type ViewMode,
} from '@/components/list-view'
import { NotFoundPage } from '@/components/not-found-page'
import {
  type AttributeField,
  type CollectionAttributes,
  type CollectionKind,
  collections,
  displayAttribute,
  facetKeysOf,
  filterKeysOf,
  groupFieldOf,
  statusMarkOf,
} from '@/lib/collections'
import { formatDay, isRecent } from '@/lib/format'
import { imageUrl, thumbnailUrl } from '@/lib/images'
import {
  type ListEntry,
  listItemId,
  rememberListOrder,
  useRememberedListOrder,
} from '@/lib/list-memory'
import { cn } from '@/lib/utils'

type ListItem = {
  slug: string
  title: string
  imageKey: string | null
  attributes: CollectionAttributes
  acquiredAt: string | null
  /** 非公開（管理者のログイン中だけ届く） */
  draft?: boolean
}

/** 一覧のサムネイルの見せ方（決めていない種類は cover） */
const imageFitOf = (kind: CollectionKind) =>
  (collections[kind] as { imageFit?: 'cover' | 'contain' }).imageFit ?? 'cover'

const sortOptions = [
  { value: 'order', label: 'おすすめ順' },
  { value: 'new', label: '日付の新しい順' },
  { value: 'old', label: '日付の古い順' },
  { value: 'name', label: '名前順' },
] as const
/** 選べる表示のしかた（写真が主役の種類には「写真」も出す） */
const viewsOf = (kind: CollectionKind): readonly ViewMode[] =>
  (collections[kind] as { galleryView?: boolean }).galleryView
    ? ['card', 'gallery', 'table']
    : ['card', 'table']

const fieldsOf = (kind: CollectionKind): readonly AttributeField[] =>
  collections[kind].fields

/**
 * 絞り込みの列（選択肢の決まった項目はその順に全部、文字の項目は多い順に 8 個まで札を見せる）。
 * カードの名前の下に出す項目（著者など）は、札は出さずにカードの値を押して絞り込めるようにする
 */
function facetsOf(kind: CollectionKind): Facet<ListItem>[] {
  const fields = fieldsOf(kind)
  const chipKeys = filterKeysOf(kind)
  return facetKeysOf(kind).flatMap((key) => {
    const field = fields.find((f) => f.key === key)
    if (!field) return []
    const select = field.type === 'select'
    return [
      {
        key,
        label: field.label,
        values: (item: ListItem) =>
          item.attributes[key] ? [item.attributes[key]] : [],
        display: (value: string) => displayAttribute(field, value),
        order: select ? field.options.map((o) => o.value) : undefined,
        limit: select ? undefined : 8,
        chips: chipKeys.includes(key),
      },
    ]
  })
}

/** カードの名前の下に出す値（メーカー / モデル など）。押すとその値で絞り込める */
function Subtitle({
  kind,
  item,
  list,
}: {
  kind: CollectionKind
  item: ListItem
  list: ListControls
}) {
  const fields = fieldsOf(kind)
  const parts = collections[kind].subtitleKeys.flatMap((key) => {
    const value = item.attributes[key]
    const field = fields.find((f) => f.key === key)
    return value && field
      ? [{ key, value, label: displayAttribute(field, value) }]
      : []
  })
  if (parts.length === 0) return null
  return (
    <p className="text-sm text-muted-foreground">
      {parts.map((part, i) => (
        <React.Fragment key={part.key}>
          {i > 0 && ' / '}
          <FilterValue list={list} facetKey={part.key} value={part.value}>
            {part.label}
          </FilterValue>
        </React.Fragment>
      ))}
    </p>
  )
}

/** 写真の上に重ねる印（下書き・状態・新着） */
function ImageBadges({
  kind,
  item,
  small,
}: {
  kind: CollectionKind
  item: ListItem
  /** 写真の表示の小さなカード用 */
  small?: boolean
}) {
  const mark = statusMarkOf(kind, item.attributes)
  const recent = isRecent(item.acquiredAt)
  if (!item.draft && !mark && !recent) return null
  return (
    <div
      className={cn(
        'absolute flex flex-wrap gap-1',
        small
          ? 'top-1 left-1 [&>*]:h-4 [&>*]:px-1 [&>*]:text-[10px]'
          : 'top-2 left-2',
      )}
    >
      {item.draft && <DraftBadge />}
      {mark && <StatusBadge tone={mark.tone}>{mark.label}</StatusBadge>}
      {recent && <NewBadge />}
    </div>
  )
}

/** 手放したもの・まだ取っていないものは、カードを薄く出す */
const isDimmed = (kind: CollectionKind, item: ListItem) =>
  statusMarkOf(kind, item.attributes)?.tone === 'dim'

const dimmedClass = 'opacity-55 transition-opacity hover:opacity-100'

/** 表に出す項目（URL は表では長すぎるので出さない） */
const tableFieldsOf = (kind: CollectionKind) =>
  fieldsOf(kind).filter((f) => f.type !== 'url')

/** 表の見出しを押して並べ替えられる列（選択肢の決まった項目は選択肢の順に並べる） */
function columnsOf(kind: CollectionKind): SortColumn<ListItem>[] {
  return [
    { key: 'title', label: '名前', value: (item) => item.title },
    ...tableFieldsOf(kind).map(
      (field): SortColumn<ListItem> => ({
        key: field.key,
        label: field.label,
        value: (item) => {
          const v = item.attributes[field.key]
          if (!v || field.type !== 'select') return v
          const i = field.options.findIndex((o) => o.value === v)
          return i >= 0 ? String(i).padStart(3, '0') : v
        },
      }),
    ),
    {
      key: 'acquiredAt',
      label: collections[kind].acquiredAtLabel,
      value: (item) => item.acquiredAt,
    },
  ]
}

/** 並べ替え（おすすめ順は、管理画面で決めた並び＝サーバーから届いた順のまま） */
function sortItems(items: ListItem[], sort: string) {
  if (sort === 'order') return items
  const date = (i: ListItem) => i.acquiredAt ?? ''
  return items.sort((x, y) =>
    sort === 'name'
      ? x.title.localeCompare(y.title, 'ja')
      : sort === 'old'
        ? date(x).localeCompare(date(y))
        : date(y).localeCompare(date(x)),
  )
}

/** コレクションの一覧（検索・絞り込み・並べ替えと、カードか表） */
export function CollectionGrid({
  kind,
  items,
  search,
}: {
  kind: CollectionKind
  items: ListItem[]
  search: ListSearch
}) {
  const config = collections[kind]
  const fields = fieldsOf(kind)
  const list = useList({
    path: config.path,
    search,
    items,
    // URL は検索の対象にしない
    text: (item) => [
      item.title,
      ...fields.map((f) => {
        const v = item.attributes[f.key]
        return v && f.type !== 'url' ? displayAttribute(f, v) : null
      }),
    ],
    facets: facetsOf(kind),
    sortOptions,
    sort: sortItems,
    columns: columnsOf(kind),
    views: viewsOf(kind),
  })
  const { visible, view } = list

  // 状態などでまとめて、見出しを付けて並べる（並べ替えはまとまりの中で効く）
  const groupField = groupFieldOf(kind)
  const groups = groupField
    ? groupItems(visible, (item) => item.attributes[groupField.key] ?? '', {
        label: (key) => (key ? displayAttribute(groupField, key) : '未設定'),
        order:
          groupField.type === 'select'
            ? groupField.options.map((o) => o.value)
            : undefined,
      })
    : [{ key: '', label: '', items: visible }]

  // 出ている並びを覚えて、詳しいページの「前へ／次へ」をこの順で動けるようにする
  const orderJson = JSON.stringify(
    groups.flatMap((g) =>
      g.items.map((i): ListEntry => ({ slug: i.slug, title: i.title })),
    ),
  )
  React.useEffect(() => {
    rememberListOrder(config.path, orderJson)
  }, [config.path, orderJson])

  if (items.length === 0) {
    return <EmptyState>まだ登録されていません。</EmptyState>
  }

  const hint = fields
    .slice(0, 2)
    .map((f) => f.label)
    .join('・')
  return (
    <>
      <ListToolbar list={list} placeholder={`名前や${hint}で探す`} />
      {visible.length === 0 ? (
        <NoMatches onClear={list.clearAll} />
      ) : view === 'table' ? (
        <CollectionTable kind={kind} groups={groups} list={list} />
      ) : view === 'gallery' ? (
        <GroupedSections groups={groups}>
          {(items) => <CollectionGallery kind={kind} items={items} />}
        </GroupedSections>
      ) : (
        <GroupedSections groups={groups}>
          {(items, grouped) => (
            <CollectionCards
              kind={kind}
              items={items}
              grouped={grouped}
              list={list}
            />
          )}
        </GroupedSections>
      )}
    </>
  )
}

function CollectionCards({
  kind,
  items,
  grouped,
  list,
}: {
  kind: CollectionKind
  items: ListItem[]
  /** まとまりの見出し（h2）の下に並ぶとき */
  grouped: boolean
  list: ListControls
}) {
  const config = collections[kind]
  const contain = imageFitOf(kind) === 'contain'
  const Title = grouped ? 'h3' : 'h2'
  return (
    <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {items.map((item) => {
        const src = thumbnailUrl(item.imageKey)
        return (
          <li
            key={item.slug}
            id={listItemId(item.slug)}
            className={cn('scroll-mt-32', isDimmed(kind, item) && dimmedClass)}
          >
            <Link
              to={config.detailPath}
              params={{ slug: item.slug }}
              className="group block"
            >
              <div className="relative aspect-square overflow-hidden rounded-lg border bg-muted/30">
                {src ? (
                  <img
                    src={src}
                    alt=""
                    loading="lazy"
                    className={cn(
                      'size-full transition-transform duration-300 group-hover:scale-105',
                      contain ? 'object-contain p-2' : 'object-cover',
                    )}
                  />
                ) : (
                  <div className="flex size-full items-center justify-center text-muted-foreground">
                    <ImageOff className="size-6" />
                  </div>
                )}
                <ImageBadges kind={kind} item={item} />
              </div>
              <Title className="mt-2 font-medium leading-snug group-hover:underline">
                {item.title}
              </Title>
            </Link>
            <Subtitle kind={kind} item={item} list={list} />
          </li>
        )
      })}
    </ul>
  )
}

/** 写真を小さく多く並べる（名前は小さく 2 行まで） */
function CollectionGallery({
  kind,
  items,
}: {
  kind: CollectionKind
  items: ListItem[]
}) {
  const config = collections[kind]
  const contain = imageFitOf(kind) === 'contain'
  return (
    <ul className="grid grid-cols-3 gap-x-3 gap-y-4 sm:grid-cols-4 md:grid-cols-6">
      {items.map((item) => {
        const src = thumbnailUrl(item.imageKey)
        return (
          <li
            key={item.slug}
            id={listItemId(item.slug)}
            className={cn('scroll-mt-32', isDimmed(kind, item) && dimmedClass)}
          >
            <Link
              to={config.detailPath}
              params={{ slug: item.slug }}
              title={item.title}
              className="group block"
            >
              <div className="relative aspect-square overflow-hidden rounded-md border bg-muted/30">
                {src ? (
                  <img
                    src={src}
                    alt=""
                    loading="lazy"
                    className={cn(
                      'size-full transition-transform duration-300 group-hover:scale-105',
                      contain ? 'object-contain p-1' : 'object-cover',
                    )}
                  />
                ) : (
                  <div className="flex size-full items-center justify-center text-muted-foreground">
                    <ImageOff className="size-5" />
                  </div>
                )}
                <ImageBadges kind={kind} item={item} small />
              </div>
              <span className="mt-1.5 line-clamp-2 text-xs leading-snug group-hover:underline">
                {item.title}
              </span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

function CollectionTable({
  kind,
  groups,
  list,
}: {
  kind: CollectionKind
  groups: readonly Group<ListItem>[]
  list: ListControls
}) {
  const config = collections[kind]
  const contain = imageFitOf(kind) === 'contain'
  const columns = tableFieldsOf(kind)
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full min-w-[40rem] text-sm">
        <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
          <tr>
            <SortableHeader list={list} column="title">
              名前
            </SortableHeader>
            {columns.map((f) => (
              <SortableHeader key={f.key} list={list} column={f.key}>
                {f.label}
              </SortableHeader>
            ))}
            <SortableHeader list={list} column="acquiredAt">
              {config.acquiredAtLabel}
            </SortableHeader>
          </tr>
        </thead>
        {groups.map((group) => (
          <tbody key={group.key}>
            {groups.length > 1 && (
              <TableGroupRow group={group} colSpan={columns.length + 2} />
            )}
            {group.items.map((item) => {
              const src = thumbnailUrl(item.imageKey)
              return (
                <tr
                  key={item.slug}
                  id={listItemId(item.slug)}
                  className={cn(
                    'scroll-mt-32 border-t align-top hover:bg-muted/30',
                    isDimmed(kind, item) && dimmedClass,
                  )}
                >
                  <td className="px-3 py-2">
                    <Link
                      to={config.detailPath}
                      params={{ slug: item.slug }}
                      className="group flex items-center gap-2.5"
                    >
                      {src ? (
                        <img
                          src={src}
                          alt=""
                          loading="lazy"
                          className={cn(
                            'size-10 shrink-0 rounded border',
                            contain
                              ? 'bg-muted/30 object-contain'
                              : 'object-cover',
                          )}
                        />
                      ) : (
                        <span className="flex size-10 shrink-0 items-center justify-center rounded border text-muted-foreground">
                          <ImageOff className="size-4" />
                        </span>
                      )}
                      <span className="font-medium group-hover:underline">
                        {item.title}
                      </span>
                      {item.draft && <DraftBadge />}
                      {isRecent(item.acquiredAt) && <NewBadge />}
                    </Link>
                  </td>
                  {columns.map((f) => {
                    const v = item.attributes[f.key]
                    return (
                      <td
                        key={f.key}
                        className="px-3 py-2 text-xs text-muted-foreground"
                      >
                        {!v ? (
                          '—'
                        ) : f.type === 'date' ? (
                          formatDay(v)
                        ) : (
                          <FilterValue list={list} facetKey={f.key} value={v}>
                            {displayAttribute(f, v)}
                          </FilterValue>
                        )}
                      </td>
                    )
                  })}
                  <td className="px-3 py-2 text-xs whitespace-nowrap text-muted-foreground">
                    {item.acquiredAt ? formatDay(item.acquiredAt) : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        ))}
      </table>
    </div>
  )
}

type DetailItem = ListItem & {
  html: string
  /** 同じ種類のもの全部の、一覧のふだんの並び */
  siblings: readonly ListEntry[]
}

/**
 * 詳しいページの前後のもの。一覧から来たときはその一覧に出ていた並び（絞り込み・並べ替えのあと）、
 * そうでなければ一覧のふだんの並びで決める
 */
function useNeighbors(
  kind: CollectionKind,
  slug: string,
  siblings: readonly ListEntry[],
) {
  const remembered = useRememberedListOrder(collections[kind].path)
  const order = remembered?.some((e) => e.slug === slug) ? remembered : siblings
  const index = order.findIndex((e) => e.slug === slug)
  return {
    prev: index > 0 ? order[index - 1] : undefined,
    next: index >= 0 ? order[index + 1] : undefined,
    /** 何番目か（並びの中にないときは 0） */
    position: index + 1,
    total: order.length,
  }
}

type Neighbors = ReturnType<typeof useNeighbors>

/** ← → のキーで前後のものへ（入力欄にいるときや、画像の拡大表示を開いているときは動かない） */
function useArrowKeys(kind: CollectionKind, { prev, next }: Neighbors) {
  const navigate = useNavigate()
  const detailPath = collections[kind].detailPath
  const prevSlug = prev?.slug
  const nextSlug = next?.slug
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        e.defaultPrevented ||
        e.altKey ||
        e.ctrlKey ||
        e.metaKey ||
        e.shiftKey
      )
        return
      const target = e.target as HTMLElement | null
      if (target?.closest('input, textarea, select, [contenteditable="true"]'))
        return
      if (document.querySelector('[role="dialog"]')) return
      const slug =
        e.key === 'ArrowLeft'
          ? prevSlug
          : e.key === 'ArrowRight'
            ? nextSlug
            : undefined
      if (!slug) return
      e.preventDefault()
      navigate({ to: detailPath, params: { slug } })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [navigate, detailPath, prevSlug, nextSlug])
}

/** 名前の上に置く、小さな「‹ 3 / 40 ›」 */
function PagerCompact({
  kind,
  neighbors,
}: {
  kind: CollectionKind
  neighbors: Neighbors
}) {
  const { prev, next, position, total } = neighbors
  if (total <= 1 || position === 0) return null
  const detailPath = collections[kind].detailPath
  const button =
    'inline-flex size-7 items-center justify-center rounded-md border hover:bg-muted hover:text-foreground'
  const disabled = cn(button, 'pointer-events-none opacity-40')
  return (
    <nav aria-label="前後のもの" className="ml-auto flex items-center gap-1.5">
      {prev ? (
        <Link
          to={detailPath}
          params={{ slug: prev.slug }}
          className={button}
          title={`前へ: ${prev.title}（← キー）`}
        >
          <ChevronLeft className="size-4" />
          <span className="sr-only">前へ</span>
        </Link>
      ) : (
        <span className={disabled} aria-hidden>
          <ChevronLeft className="size-4" />
        </span>
      )}
      <span className="min-w-12 text-center text-xs tabular-nums">
        {position} / {total}
      </span>
      {next ? (
        <Link
          to={detailPath}
          params={{ slug: next.slug }}
          className={button}
          title={`次へ: ${next.title}（→ キー）`}
        >
          <ChevronRight className="size-4" />
          <span className="sr-only">次へ</span>
        </Link>
      ) : (
        <span className={disabled} aria-hidden>
          <ChevronRight className="size-4" />
        </span>
      )}
    </nav>
  )
}

/** ページの終わりに置く、前後のものの名前つきのリンク */
function PagerFull({
  kind,
  neighbors: { prev, next },
}: {
  kind: CollectionKind
  neighbors: Neighbors
}) {
  if (!prev && !next) return null
  const detailPath = collections[kind].detailPath
  const box =
    'group flex min-w-0 flex-col gap-0.5 rounded-lg border p-3 hover:bg-muted/40'
  return (
    <nav aria-label="前後のもの" className="grid grid-cols-2 gap-3">
      {prev ? (
        <Link to={detailPath} params={{ slug: prev.slug }} className={box}>
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <ChevronLeft className="size-3.5" />
            前へ
          </span>
          <span className="truncate text-sm font-medium group-hover:underline">
            {prev.title}
          </span>
        </Link>
      ) : (
        <span />
      )}
      {next && (
        <Link
          to={detailPath}
          params={{ slug: next.slug }}
          className={cn(box, 'items-end text-right')}
        >
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            次へ
            <ChevronRight className="size-3.5" />
          </span>
          <span className="max-w-full truncate text-sm font-medium group-hover:underline">
            {next.title}
          </span>
        </Link>
      )}
    </nav>
  )
}

/** コレクションの詳細 */
export function CollectionDetail({
  kind,
  item,
}: {
  kind: CollectionKind
  item: DetailItem
}) {
  const config = collections[kind]
  const src = imageUrl(item.imageKey)
  const neighbors = useNeighbors(kind, item.slug, item.siblings)
  useArrowKeys(kind, neighbors)

  const fields: readonly AttributeField[] = config.fields
  const rows: { label: string; value: React.ReactNode }[] = [
    ...fields.flatMap<{ label: string; value: React.ReactNode }>((field) => {
      const value = item.attributes[field.key]
      if (!value) return []
      if (field.type === 'url') {
        return [
          {
            label: field.label,
            value: (
              <a
                href={value}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 underline"
              >
                開く
                <ExternalLink className="size-3" />
              </a>
            ),
          },
        ]
      }
      if (field.type === 'date') {
        return [{ label: field.label, value: formatDay(value) }]
      }
      return [{ label: field.label, value: displayAttribute(field, value) }]
    }),
    ...(item.acquiredAt
      ? [{ label: config.acquiredAtLabel, value: formatDay(item.acquiredAt) }]
      : []),
  ]

  return (
    <article className="mx-auto w-full max-w-5xl px-6 py-8">
      <div className="grid gap-8 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        {src ? (
          // 一覧のサムネイルは正方形に切り抜くが、ここでは切らずに全体を見せる
          <div className="self-start md:sticky md:top-20">
            <ZoomableImage
              src={src}
              alt={item.title}
              className="rounded-lg border bg-muted/30"
              imgClassName="mx-auto max-h-[70vh] w-auto object-contain"
            />
            <p className="mt-2 text-center text-xs text-muted-foreground">
              クリックで拡大
            </p>
          </div>
        ) : (
          <div className="flex aspect-square items-center justify-center rounded-lg border bg-muted/30 text-muted-foreground">
            <ImageOff className="size-8" />
          </div>
        )}

        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            {config.label}
            {item.draft && <DraftBadge />}
            <PagerCompact kind={kind} neighbors={neighbors} />
          </div>
          <h1 className="mt-1 text-3xl font-bold leading-tight">
            {item.title}
          </h1>
          {rows.length > 0 && (
            <dl className="mt-6 divide-y border-y text-sm">
              {rows.map((row) => (
                <div
                  key={row.label}
                  className="grid grid-cols-[8rem_1fr] gap-4 py-2"
                >
                  <dt className="text-muted-foreground">{row.label}</dt>
                  <dd>{row.value}</dd>
                </div>
              ))}
            </dl>
          )}
          {item.html && <RichTextContent html={item.html} className="mt-6" />}
        </div>
      </div>

      <BackLinkFooter
        to={config.path}
        slug={item.slug}
        before={<PagerFull kind={kind} neighbors={neighbors} />}
      >
        {config.label}の一覧へ
      </BackLinkFooter>
    </article>
  )
}

export function CollectionNotFound({ kind }: { kind: CollectionKind }) {
  const config = collections[kind]
  return (
    <NotFoundPage
      width="max-w-3xl"
      title="見つかりません"
      message="削除されたか、URL が間違っている可能性があります。"
      backTo={config.path}
      backLabel={<>{config.label}の一覧へ</>}
    />
  )
}
