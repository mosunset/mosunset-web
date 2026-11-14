import { createFileRoute, Link } from '@tanstack/react-router'
import { useMemo } from 'react'

import {
  countValues,
  FilterChips,
  ListToolbar,
  matchesQuery,
  NoMatches,
  parseListSearch,
  useListSearch,
  type ViewMode,
} from '@/components/list-view'
import { SectionPage } from '@/components/section-page'
import { formatDay } from '@/lib/format'
import { getNavItem } from '@/lib/navigation'
import { playgroundCategories, playgroundTools } from '@/lib/playground'
import { sectionHead } from '@/lib/seo'

const item = getNavItem('/playground')

export const Route = createFileRoute('/playground/')({
  head: () => sectionHead(item),
  validateSearch: parseListSearch,
  component: PlaygroundIndex,
})

const sortOptions = [
  { value: 'new', label: '新しい順' },
  { value: 'old', label: '古い順' },
  { value: 'name', label: '名前順' },
] as const
const views: readonly ViewMode[] = ['card', 'table']

type Tool = (typeof playgroundTools)[number]

function PlaygroundIndex() {
  const search = Route.useSearch()
  const list = useListSearch(search)
  const sort = sortOptions.some((o) => o.value === search.sort)
    ? (search.sort as string)
    : 'new'
  const view: ViewMode = search.view === 'table' ? 'table' : 'card'

  const categoryOptions = useMemo(
    () =>
      playgroundCategories.map((c) => ({
        value: c,
        label: c,
        count: playgroundTools.filter((t) => t.category === c).length,
      })),
    [],
  )
  const tagOptions = useMemo(
    () => countValues(playgroundTools.map((t) => t.tags)),
    [],
  )

  const tools = useMemo(() => {
    const filtered = playgroundTools.filter(
      (t) =>
        (list.cat === null || t.category === list.cat) &&
        list.tags.every((tag) => (t.tags as readonly string[]).includes(tag)) &&
        matchesQuery(list.query, t.name, t.description, t.category, ...t.tags),
    )
    return [...filtered].sort((a, b) =>
      sort === 'name'
        ? a.name.localeCompare(b.name, 'ja')
        : sort === 'old'
          ? a.publishedDate.localeCompare(b.publishedDate)
          : b.publishedDate.localeCompare(a.publishedDate),
    )
  }, [list.cat, list.tags, list.query, sort])

  const filtering =
    list.query !== '' || list.cat !== null || list.tags.length > 0

  return (
    <SectionPage item={item}>
      <ListToolbar
        query={list.query}
        onQuery={list.setQuery}
        placeholder="ツールの名前・説明・タグで探す"
        sortOptions={sortOptions}
        sort={sort}
        onSort={(s) => list.set({ sort: s === 'new' ? undefined : s })}
        views={views}
        view={view}
        onView={(v) => list.set({ view: v === 'card' ? undefined : v })}
        shown={tools.length}
        total={playgroundTools.length}
        onClear={filtering ? list.clearAll : undefined}
      >
        <FilterChips
          label="カテゴリ"
          options={categoryOptions}
          selected={list.cat ? [list.cat] : []}
          onToggle={(c) => list.setCat(list.cat === c ? null : c)}
          onAll={() => list.setCat(null)}
        />
        <FilterChips
          label="タグ"
          options={tagOptions}
          selected={list.tags}
          onToggle={list.toggleTag}
          limit={16}
        />
      </ListToolbar>

      {tools.length === 0 ? (
        <NoMatches onClear={list.clearAll} />
      ) : view === 'table' ? (
        <ToolTable tools={tools} onTag={list.toggleTag} />
      ) : (
        <ToolCards tools={tools} />
      )}
    </SectionPage>
  )
}

function ToolCards({ tools }: { tools: Tool[] }) {
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {tools.map((tool) => (
        <li key={tool.slug}>
          <Link
            to={`/playground/${tool.slug}`}
            className="group flex h-full flex-col overflow-hidden rounded-lg border transition-colors hover:bg-muted/40"
          >
            <div className="aspect-[1200/630] overflow-hidden border-b bg-muted/30">
              <img
                src={tool.thumbnail}
                alt=""
                loading="lazy"
                className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
            </div>
            <div className="flex flex-1 flex-col gap-1 p-4">
              <span className="text-xs text-muted-foreground">
                {tool.category}
              </span>
              <h2 className="font-semibold group-hover:underline">
                {tool.name}
              </h2>
              <p className="line-clamp-2 text-sm text-muted-foreground">
                {tool.description}
              </p>
              <div className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 pt-2 text-xs text-muted-foreground">
                <time dateTime={tool.publishedDate}>
                  {formatDay(tool.publishedDate)}
                </time>
                {tool.tags.slice(0, 3).map((tag) => (
                  <span key={tag}>#{tag}</span>
                ))}
              </div>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  )
}

function ToolTable({
  tools,
  onTag,
}: {
  tools: Tool[]
  onTag: (tag: string) => void
}) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full min-w-[40rem] text-sm">
        <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-normal">ツール</th>
            <th className="px-3 py-2 font-normal">カテゴリ</th>
            <th className="px-3 py-2 font-normal">タグ</th>
            <th className="px-3 py-2 font-normal whitespace-nowrap">公開日</th>
          </tr>
        </thead>
        <tbody>
          {tools.map((tool) => (
            <tr
              key={tool.slug}
              className="border-t align-top hover:bg-muted/30"
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
                {tool.category}
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
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
