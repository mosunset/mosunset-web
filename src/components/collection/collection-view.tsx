import { Link } from '@tanstack/react-router'
import { ExternalLink, ImageOff } from 'lucide-react'
import * as React from 'react'

import { BackLinkFooter } from '@/components/back-link-footer'
import { DraftBadge } from '@/components/draft-badge'
import { EmptyState } from '@/components/empty-state'
import { RichTextContent, ZoomableImage } from '@/components/image-viewer'
import {
  FilterChips,
  type ListSearch,
  ListToolbar,
  matchesQuery,
  NoMatches,
  useListSearch,
  type ViewMode,
} from '@/components/list-view'
import { NotFoundPage } from '@/components/not-found-page'
import {
  type AttributeField,
  type CollectionAttributes,
  type CollectionKind,
  collections,
  displayAttribute,
  itemSubtitle,
} from '@/lib/collections'
import { formatDay } from '@/lib/format'
import { imageUrl } from '@/lib/images'

type ListItem = {
  slug: string
  title: string
  imageKey: string | null
  attributes: CollectionAttributes
  acquiredAt: string | null
  /** 非公開（管理者のログイン中だけ届く） */
  draft?: boolean
}

const sortOptions = [
  { value: 'order', label: 'おすすめ順' },
  { value: 'new', label: '日付の新しい順' },
  { value: 'old', label: '日付の古い順' },
  { value: 'name', label: '名前順' },
] as const
const views: readonly ViewMode[] = ['card', 'table']

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
  const fields: readonly AttributeField[] = config.fields
  const filterField: AttributeField | undefined = fields.find(
    (f) => 'filterKey' in config && f.key === config.filterKey,
  )
  const list = useListSearch(search)
  const sort = sortOptions.some((o) => o.value === search.sort)
    ? (search.sort as string)
    : 'order'
  const view: ViewMode = search.view === 'table' ? 'table' : 'card'

  // 絞り込みの候補（登録されている値だけ、項目定義の順に並べる）
  const filterOptions = React.useMemo(() => {
    if (!filterField) return []
    const counts = new Map<string, number>()
    for (const item of items) {
      const value = item.attributes[filterField.key]
      if (value) counts.set(value, (counts.get(value) ?? 0) + 1)
    }
    const order =
      filterField.type === 'select'
        ? filterField.options.map((o) => o.value)
        : [...counts.keys()]
    return order
      .filter((value) => counts.has(value))
      .map((value) => ({
        value,
        label: displayAttribute(filterField, value),
        count: counts.get(value) ?? 0,
      }))
  }, [filterField, items])

  const visible = React.useMemo(() => {
    const filtered = items.filter(
      (item) =>
        (!list.cat ||
          !filterField ||
          item.attributes[filterField.key] === list.cat) &&
        matchesQuery(
          list.query,
          item.title,
          ...fields.map((f) => {
            const v = item.attributes[f.key]
            return v && f.type !== 'url' ? displayAttribute(f, v) : null
          }),
        ),
    )
    // おすすめ順は、管理画面で決めた並び（サーバーから届いた順）のまま
    if (sort === 'order') return filtered
    const date = (i: ListItem) => i.acquiredAt ?? ''
    return [...filtered].sort((x, y) =>
      sort === 'name'
        ? x.title.localeCompare(y.title, 'ja')
        : sort === 'old'
          ? date(x).localeCompare(date(y))
          : date(y).localeCompare(date(x)),
    )
  }, [items, list.cat, list.query, sort, filterField, fields])

  if (items.length === 0) {
    return <EmptyState>まだ登録されていません。</EmptyState>
  }

  const filtering = list.query !== '' || list.cat !== null
  const hint = fields
    .slice(0, 2)
    .map((f) => f.label)
    .join('・')
  return (
    <>
      <ListToolbar
        query={list.query}
        onQuery={list.setQuery}
        placeholder={`名前や${hint}で探す`}
        sortOptions={sortOptions}
        sort={sort}
        onSort={(v) => list.set({ sort: v === 'order' ? undefined : v })}
        views={views}
        view={view}
        onView={(v) => list.set({ view: v === 'card' ? undefined : v })}
        shown={visible.length}
        total={items.length}
        onClear={filtering ? list.clearAll : undefined}
      >
        {filterField && filterOptions.length > 1 && (
          <FilterChips
            label={filterField.label}
            options={filterOptions}
            selected={list.cat ? [list.cat] : []}
            onToggle={(v) => list.setCat(list.cat === v ? null : v)}
            onAll={() => list.setCat(null)}
          />
        )}
      </ListToolbar>
      {visible.length === 0 ? (
        <NoMatches onClear={list.clearAll} />
      ) : view === 'table' ? (
        <CollectionTable kind={kind} items={visible} />
      ) : (
        <CollectionCards kind={kind} items={visible} />
      )}
    </>
  )
}

function CollectionCards({
  kind,
  items,
}: {
  kind: CollectionKind
  items: ListItem[]
}) {
  const config = collections[kind]
  return (
    <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {items.map((item) => {
        const src = imageUrl(item.imageKey)
        const subtitle = itemSubtitle(kind, item.attributes)
        return (
          <li key={item.slug}>
            <Link
              to={config.detailPath}
              params={{ slug: item.slug }}
              className="group block"
            >
              <div className="aspect-square overflow-hidden rounded-lg border bg-muted/30">
                {src ? (
                  <img
                    src={src}
                    alt=""
                    loading="lazy"
                    className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                ) : (
                  <div className="flex size-full items-center justify-center text-muted-foreground">
                    <ImageOff className="size-6" />
                  </div>
                )}
              </div>
              {item.draft && <DraftBadge className="mt-2" />}
              <h2 className="mt-2 font-medium leading-snug group-hover:underline">
                {item.title}
              </h2>
              {subtitle && (
                <p className="text-sm text-muted-foreground">{subtitle}</p>
              )}
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

function CollectionTable({
  kind,
  items,
}: {
  kind: CollectionKind
  items: ListItem[]
}) {
  const config = collections[kind]
  // URL は表では長すぎるので出さない
  const columns = (config.fields as readonly AttributeField[]).filter(
    (f) => f.type !== 'url',
  )
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full min-w-[40rem] text-sm">
        <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-normal">名前</th>
            {columns.map((f) => (
              <th
                key={f.key}
                className="px-3 py-2 font-normal whitespace-nowrap"
              >
                {f.label}
              </th>
            ))}
            <th className="px-3 py-2 font-normal whitespace-nowrap">
              {config.acquiredAtLabel}
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const src = imageUrl(item.imageKey)
            return (
              <tr
                key={item.slug}
                className="border-t align-top hover:bg-muted/30"
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
                        className="size-10 shrink-0 rounded border object-cover"
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
                  </Link>
                </td>
                {columns.map((f) => {
                  const v = item.attributes[f.key]
                  return (
                    <td
                      key={f.key}
                      className="px-3 py-2 text-xs text-muted-foreground"
                    >
                      {v
                        ? f.type === 'date'
                          ? formatDay(v)
                          : displayAttribute(f, v)
                        : '—'}
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
      </table>
    </div>
  )
}

type DetailItem = ListItem & { html: string }

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
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            {config.label}
            {item.draft && <DraftBadge />}
          </p>
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

      <BackLinkFooter to={config.path}>{config.label}の一覧へ</BackLinkFooter>
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
