import { Link } from '@tanstack/react-router'
import { ArrowLeft, ExternalLink, ImageOff } from 'lucide-react'
import * as React from 'react'

import { EmptyState } from '@/components/empty-state'
import { RichTextContent, ZoomableImage } from '@/components/image-viewer'
import {
  type AttributeField,
  type CollectionAttributes,
  type CollectionKind,
  collections,
  displayAttribute,
  itemSubtitle,
} from '@/lib/collections'
import { formatDate } from '@/lib/format'
import { imageUrl } from '@/lib/images'

type ListItem = {
  slug: string
  title: string
  imageKey: string | null
  attributes: CollectionAttributes
  acquiredAt: string | null
}

/** "2026-11-03" を「2026年11月3日」にする */
function formatDay(value: string) {
  return formatDate(new Date(`${value}T00:00:00+09:00`))
}

/** コレクションの一覧（カードのグリッド） */
export function CollectionGrid({
  kind,
  items,
}: {
  kind: CollectionKind
  items: ListItem[]
}) {
  const config = collections[kind]
  const filterField: AttributeField | undefined = (
    config.fields as readonly AttributeField[]
  ).find((f) => 'filterKey' in config && f.key === config.filterKey)
  const [filter, setFilter] = React.useState<string | null>(null)

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

  const visible =
    filter && filterField
      ? items.filter((item) => item.attributes[filterField.key] === filter)
      : items

  if (items.length === 0) {
    return <EmptyState>まだ登録されていません。</EmptyState>
  }

  return (
    <>
      {filterOptions.length > 1 && (
        <fieldset className="mb-6 flex flex-wrap gap-2">
          <legend className="sr-only">{filterField?.label}で絞り込む</legend>
          {[
            { value: null, label: 'すべて', count: items.length },
            ...filterOptions,
          ].map((option) => {
            const active = filter === option.value
            return (
              <button
                key={option.value ?? 'all'}
                type="button"
                aria-pressed={active}
                onClick={() => setFilter(option.value)}
                className={
                  active
                    ? 'rounded-full border border-foreground bg-foreground px-3 py-1 text-sm text-background'
                    : 'rounded-full border px-3 py-1 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground'
                }
              >
                {option.label}
                <span className="ml-1 text-xs opacity-70">{option.count}</span>
              </button>
            )
          })}
        </fieldset>
      )}
      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {visible.map((item) => {
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
    </>
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
          <p className="text-sm text-muted-foreground">{config.label}</p>
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

      <footer className="mt-12 border-t pt-6">
        <Link
          to={config.path}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          {config.label}の一覧へ
        </Link>
      </footer>
    </article>
  )
}

export function CollectionNotFound({ kind }: { kind: CollectionKind }) {
  const config = collections[kind]
  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-8">
      <h1 className="text-3xl font-bold">見つかりません</h1>
      <p className="mt-4 text-muted-foreground">
        削除されたか、URL が間違っている可能性があります。
      </p>
      <Link to={config.path} className="mt-6 inline-block underline">
        {config.label}の一覧へ
      </Link>
    </div>
  )
}
