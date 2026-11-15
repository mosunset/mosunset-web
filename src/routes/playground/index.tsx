import { createFileRoute, Link } from '@tanstack/react-router'

import { NewBadge } from '@/components/item-badges'
import {
  type Facet,
  FilterValue,
  type ListControls,
  ListToolbar,
  listSearchValidator,
  NoMatches,
  SortableHeader,
  type SortColumn,
  useList,
  type ViewMode,
} from '@/components/list-view'
import { SectionPage } from '@/components/section-page'
import { formatDay, isRecent } from '@/lib/format'
import { listItemId } from '@/lib/list-memory'
import { getNavItem } from '@/lib/navigation'
import { playgroundCategories, playgroundTools } from '@/lib/playground'
import { sectionHead } from '@/lib/seo'

const item = getNavItem('/playground')

type Tool = (typeof playgroundTools)[number]

const facets: readonly Facet<Tool>[] = [
  {
    key: 'cat',
    label: 'カテゴリ',
    values: (t) => [t.category],
    order: playgroundCategories,
  },
  {
    key: 'tag',
    label: 'タグ',
    values: (t) => t.tags,
    multiple: true,
    limit: 16,
  },
]

export const Route = createFileRoute('/playground/')({
  head: () => sectionHead(item),
  validateSearch: listSearchValidator(facets.map((f) => f.key)),
  component: PlaygroundIndex,
})

const sortOptions = [
  { value: 'new', label: '新しい順' },
  { value: 'old', label: '古い順' },
  { value: 'name', label: '名前順' },
] as const
const views: readonly ViewMode[] = ['card', 'table']

/** 表の見出しを押して並べ替えられる列 */
const columns: readonly SortColumn<Tool>[] = [
  { key: 'name', label: 'ツール', value: (t) => t.name },
  { key: 'category', label: 'カテゴリ', value: (t) => t.category },
  { key: 'date', label: '公開日', value: (t) => t.publishedDate },
]

const toolText = (t: Tool) => [t.name, t.description, t.category, ...t.tags]

function sortTools(tools: Tool[], sort: string) {
  return tools.sort((a, b) =>
    sort === 'name'
      ? a.name.localeCompare(b.name, 'ja')
      : sort === 'old'
        ? a.publishedDate.localeCompare(b.publishedDate)
        : b.publishedDate.localeCompare(a.publishedDate),
  )
}

function PlaygroundIndex() {
  const search = Route.useSearch()
  const list = useList({
    path: '/playground',
    search,
    items: playgroundTools,
    text: toolText,
    facets,
    sortOptions,
    sort: sortTools,
    columns,
    views,
  })
  const tools = list.visible

  return (
    <SectionPage item={item}>
      <ListToolbar
        list={list}
        placeholder="ツールの名前・説明・タグで探す"
        shortPlaceholder="ツールを探す"
      />
      {tools.length === 0 ? (
        <NoMatches onClear={list.clearAll} />
      ) : list.view === 'table' ? (
        <ToolTable tools={tools} list={list} />
      ) : (
        <ToolCards tools={tools} list={list} />
      )}
    </SectionPage>
  )
}

/**
 * カード全体を押すとツールへ。名前のリンクをカードいっぱいに広げ（after:inset-0）、
 * カテゴリとタグはその上に重ねたボタンにして、押すとそれで絞り込む。
 * スマホでは、画像を左に小さく置いた横長のカードにする（縦に大きいカードが 25 枚並ぶと長すぎるため）
 */
function ToolCards({ tools, list }: { tools: Tool[]; list: ListControls }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
      {tools.map((tool) => (
        <li key={tool.slug} id={listItemId(tool.slug)} className="scroll-mt-32">
          <div className="group relative flex h-full gap-3 overflow-hidden rounded-lg border p-3 transition-colors hover:bg-muted/40 sm:flex-col sm:gap-0 sm:p-0">
            <div className="aspect-[1200/630] w-28 shrink-0 self-start overflow-hidden rounded-md border bg-muted/30 sm:w-auto sm:self-auto sm:rounded-none sm:border-0 sm:border-b">
              <img
                src={tool.thumbnail}
                alt=""
                loading="lazy"
                className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-1 sm:p-4">
              <FilterValue
                list={list}
                facetKey="cat"
                value={tool.category}
                className="self-start text-xs text-muted-foreground"
              >
                {tool.category}
              </FilterValue>
              <h2 className="font-semibold group-hover:underline">
                <Link
                  to={`/playground/${tool.slug}`}
                  className="after:absolute after:inset-0 after:content-['']"
                >
                  {tool.name}
                </Link>
              </h2>
              <p className="line-clamp-2 text-sm text-muted-foreground">
                {tool.description}
              </p>
              <div className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 pt-2 text-xs text-muted-foreground">
                <time dateTime={tool.publishedDate}>
                  {formatDay(tool.publishedDate)}
                </time>
                {isRecent(tool.publishedDate) && <NewBadge />}
                {/* スマホではタグを 2 つまで（カードを低く保つ） */}
                {tool.tags.slice(0, 3).map((tag, i) => (
                  <FilterValue
                    key={tag}
                    list={list}
                    facetKey="tag"
                    value={tag}
                    className={i >= 2 ? 'hidden sm:inline' : undefined}
                  >
                    #{tag}
                  </FilterValue>
                ))}
              </div>
            </div>
          </div>
        </li>
      ))}
    </ul>
  )
}

function ToolTable({ tools, list }: { tools: Tool[]; list: ListControls }) {
  const onTag = (tag: string) => list.toggle('tag', tag)
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full min-w-[40rem] text-sm">
        <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
          <tr>
            <SortableHeader list={list} column="name">
              ツール
            </SortableHeader>
            <SortableHeader list={list} column="category">
              カテゴリ
            </SortableHeader>
            <th className="px-3 py-2 font-normal">タグ</th>
            <SortableHeader list={list} column="date">
              公開日
            </SortableHeader>
          </tr>
        </thead>
        <tbody>
          {tools.map((tool) => (
            <tr
              key={tool.slug}
              id={listItemId(tool.slug)}
              className="scroll-mt-32 border-t align-top hover:bg-muted/30"
            >
              <td className="px-3 py-2">
                <Link
                  to={`/playground/${tool.slug}`}
                  className="group flex items-start gap-3"
                >
                  <img
                    src={tool.thumbnail}
                    alt=""
                    loading="lazy"
                    className="aspect-[1200/630] w-20 shrink-0 rounded border object-cover"
                  />
                  <span className="min-w-0">
                    <span className="font-medium group-hover:underline">
                      {tool.name}
                    </span>
                    <span className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                      {tool.description}
                    </span>
                  </span>
                </Link>
              </td>
              <td className="px-3 py-2 text-xs whitespace-nowrap text-muted-foreground">
                <FilterValue list={list} facetKey="cat" value={tool.category}>
                  {tool.category}
                </FilterValue>
              </td>
              <td className="px-3 py-2">
                <div className="flex flex-wrap gap-1">
                  {tool.tags.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => onTag(tag)}
                      title={`「${tag}」で絞り込む`}
                      className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground"
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </td>
              <td className="px-3 py-2 font-mono text-xs whitespace-nowrap tabular-nums text-muted-foreground">
                {formatDay(tool.publishedDate)}
                {isRecent(tool.publishedDate) && <NewBadge className="ml-2" />}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
