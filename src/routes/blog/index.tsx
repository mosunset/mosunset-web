import { createFileRoute, Link } from '@tanstack/react-router'
import { useMemo } from 'react'

import { DraftBadge } from '@/components/draft-badge'
import { EmptyState } from '@/components/empty-state'
import {
  ListToolbar,
  matchesQuery,
  NoMatches,
  parseListSearch,
  useListSearch,
  type ViewMode,
} from '@/components/list-view'
import { SectionPage } from '@/components/section-page'
import { listPublishedPosts } from '@/functions/posts'
import { formatDate } from '@/lib/format'
import { imagePath } from '@/lib/images'
import { getNavItem } from '@/lib/navigation'
import { sectionHead } from '@/lib/seo'

const item = getNavItem('/blog')

export const Route = createFileRoute('/blog/')({
  head: () => sectionHead(item),
  validateSearch: parseListSearch,
  loader: () => listPublishedPosts(),
  component: BlogIndex,
})

const sortOptions = [
  { value: 'new', label: '新しい順' },
  { value: 'old', label: '古い順' },
  { value: 'title', label: 'タイトル順' },
] as const
const views: readonly ViewMode[] = ['list', 'card', 'table']

type Post = Awaited<ReturnType<typeof listPublishedPosts>>[number]

function BlogIndex() {
  const posts = Route.useLoaderData()
  const search = Route.useSearch()
  const list = useListSearch(search)
  const sort = sortOptions.some((o) => o.value === search.sort)
    ? (search.sort as string)
    : 'new'
  const view: ViewMode = search.view ?? 'list'

  const visible = useMemo(() => {
    // 公開日のない下書きは、いちばん新しいものとして扱う
    const time = (p: Post) =>
      p.publishedAt ? +new Date(p.publishedAt) : Number.MAX_SAFE_INTEGER
    return posts
      .filter((p) => matchesQuery(list.query, p.title, p.excerpt))
      .sort((a, b) =>
        sort === 'title'
          ? a.title.localeCompare(b.title, 'ja')
          : sort === 'old'
            ? time(a) - time(b)
            : time(b) - time(a),
      )
  }, [posts, list.query, sort])

  if (posts.length === 0) {
    return (
      <SectionPage item={item}>
        <EmptyState>まだ記事はありません。</EmptyState>
      </SectionPage>
    )
  }

  return (
    <SectionPage item={item}>
      <ListToolbar
        query={list.query}
        onQuery={list.setQuery}
        placeholder="タイトルや本文の抜粋で探す"
        sortOptions={sortOptions}
        sort={sort}
        onSort={(s) => list.set({ sort: s === 'new' ? undefined : s })}
        views={views}
        view={view}
        onView={(v) => list.set({ view: v === 'list' ? undefined : v })}
        shown={visible.length}
        total={posts.length}
        onClear={list.query ? list.clearAll : undefined}
      />
      {visible.length === 0 ? (
        <NoMatches onClear={list.clearAll} />
      ) : view === 'card' ? (
        <PostCards posts={visible} />
      ) : view === 'table' ? (
        <PostTable posts={visible} />
      ) : (
        <PostList posts={visible} />
      )}
    </SectionPage>
  )
}

function PostDate({ post, className }: { post: Post; className?: string }) {
  if (post.draft) return <DraftBadge />
  if (!post.publishedAt) return null
  const date = new Date(post.publishedAt)
  return (
    <time dateTime={date.toISOString()} className={className}>
      {formatDate(date)}
    </time>
  )
}

function PostList({ posts }: { posts: Post[] }) {
  return (
    <ul className="divide-y">
      {posts.map((post) => (
        <li key={post.slug}>
          <Link
            to="/blog/$slug"
            params={{ slug: post.slug }}
            className="group flex gap-4 py-6 sm:gap-6"
          >
            <div className="min-w-0 flex-1">
              <PostDate post={post} className="text-sm text-muted-foreground" />
              <h2 className="mt-1 text-lg font-semibold group-hover:underline sm:text-xl">
                {post.title}
              </h2>
              {post.excerpt && (
                <p className="mt-2 line-clamp-3 text-sm text-muted-foreground sm:text-base">
                  {post.excerpt}
                </p>
              )}
            </div>
            {post.coverImageKey && (
              <img
                src={imagePath(post.coverImageKey)}
                alt=""
                loading="lazy"
                className="aspect-[4/3] w-24 shrink-0 self-start rounded-md border object-cover sm:w-40"
              />
            )}
          </Link>
        </li>
      ))}
    </ul>
  )
}

function PostCards({ posts }: { posts: Post[] }) {
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {posts.map((post) => (
        <li key={post.slug}>
          <Link
            to="/blog/$slug"
            params={{ slug: post.slug }}
            className="group flex h-full flex-col overflow-hidden rounded-lg border transition-colors hover:bg-muted/40"
          >
            <div className="aspect-[4/3] overflow-hidden border-b bg-muted/30">
              {post.coverImageKey && (
                <img
                  src={imagePath(post.coverImageKey)}
                  alt=""
                  loading="lazy"
                  className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
              )}
            </div>
            <div className="flex flex-1 flex-col gap-1 p-4">
              <PostDate post={post} className="text-xs text-muted-foreground" />
              <h2 className="font-semibold group-hover:underline">
                {post.title}
              </h2>
              {post.excerpt && (
                <p className="line-clamp-3 text-sm text-muted-foreground">
                  {post.excerpt}
                </p>
              )}
            </div>
          </Link>
        </li>
      ))}
    </ul>
  )
}

function PostTable({ posts }: { posts: Post[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full min-w-[32rem] text-sm">
        <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-normal">タイトル</th>
            <th className="px-3 py-2 font-normal whitespace-nowrap">公開日</th>
          </tr>
        </thead>
        <tbody>
          {posts.map((post) => (
            <tr key={post.slug} className="border-t hover:bg-muted/30">
              <td className="px-3 py-2">
                <Link
                  to="/blog/$slug"
                  params={{ slug: post.slug }}
                  className="font-medium hover:underline"
                >
                  {post.title}
                </Link>
                {post.excerpt && (
                  <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                    {post.excerpt}
                  </p>
                )}
              </td>
              <td className="px-3 py-2 text-xs whitespace-nowrap text-muted-foreground">
                <PostDate post={post} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
