import { createFileRoute, Link } from '@tanstack/react-router'
import { Rss } from 'lucide-react'

import { DraftBadge } from '@/components/common/draft-badge'
import { EmptyState } from '@/components/common/empty-state'
import { NewBadge } from '@/components/common/item-badges'
import { SectionPage } from '@/components/common/section-page'
import {
  type Group,
  GroupedSections,
  groupItems,
  NoMatches,
} from '@/components/list/grouped-sections'
import { listSearchValidator } from '@/components/list/list-search'
import { SortableHeader, TableGroupRow } from '@/components/list/list-table'
import { ListToolbar } from '@/components/list/list-toolbar'
import {
  type ListControls,
  parseColumnSort,
  type SortColumn,
  useList,
  type ViewMode,
} from '@/components/list/use-list'
import { listPublishedPosts } from '@/functions/posts'
import { formatDate, isRecent, yearOf } from '@/lib/format'
import { thumbnailUrl } from '@/lib/images'
import { listItemId } from '@/lib/list-memory'
import { getNavItem } from '@/lib/navigation'
import { sectionHead } from '@/lib/seo'

const item = getNavItem('/blog')

export const Route = createFileRoute('/blog/')({
  head: () => sectionHead(item),
  validateSearch: listSearchValidator(),
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

/** 表の見出しを押して並べ替えられる列 */
const columns: readonly SortColumn<Post>[] = [
  { key: 'title', label: 'タイトル', value: (p) => p.title },
  {
    key: 'date',
    label: '公開日',
    value: (p) =>
      p.publishedAt ? new Date(p.publishedAt).toISOString() : null,
  },
]

const postText = (p: Post) => [p.title, p.excerpt]

// 公開日のない下書きは、いちばん新しいものとして扱う
const postTime = (p: Post) =>
  p.publishedAt ? +new Date(p.publishedAt) : Number.MAX_SAFE_INTEGER

function sortPosts(posts: Post[], sort: string) {
  return posts.sort((a, b) =>
    sort === 'title'
      ? a.title.localeCompare(b.title, 'ja')
      : sort === 'old'
        ? postTime(a) - postTime(b)
        : postTime(b) - postTime(a),
  )
}

function BlogIndex() {
  const posts = Route.useLoaderData()
  const search = Route.useSearch()
  const list = useList({
    path: '/blog',
    search,
    items: posts,
    text: postText,
    sortOptions,
    sort: sortPosts,
    columns,
    views,
  })
  const { visible, view } = list
  // 日付の順のときは年ごとに見出しを付ける（公開日のない下書きは「下書き」にまとめる）
  const byDate =
    list.sort === 'new' ||
    list.sort === 'old' ||
    parseColumnSort(list.sort)?.key === 'date'
  const groups = !byDate
    ? [{ key: '', label: '', items: visible }]
    : groupItems(
        visible,
        (p) => (p.publishedAt ? yearOf(new Date(p.publishedAt)) : ''),
        { label: (year) => (year ? `${year} 年` : '下書き') },
      )

  if (posts.length === 0) {
    return (
      <SectionPage item={item} actions={<RssLink />}>
        <EmptyState>まだ記事はありません。</EmptyState>
      </SectionPage>
    )
  }

  return (
    <SectionPage item={item} actions={<RssLink />}>
      <ListToolbar
        list={list}
        placeholder="タイトルや本文の抜粋で探す"
        shortPlaceholder="記事を探す"
      />
      {visible.length === 0 ? (
        <NoMatches onClear={list.clearAll} />
      ) : view === 'table' ? (
        <PostTable groups={groups} list={list} />
      ) : (
        <GroupedSections groups={groups}>
          {(posts, grouped) =>
            view === 'card' ? (
              <PostCards posts={posts} grouped={grouped} />
            ) : (
              <PostList posts={posts} grouped={grouped} />
            )
          }
        </GroupedSections>
      )}
    </SectionPage>
  )
}

/** RSS（新しい記事をフィードリーダーで受け取る） */
function RssLink() {
  return (
    <a
      href="/rss.xml"
      className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
    >
      <Rss className="size-4" />
      RSS
    </a>
  )
}

/** 公開日（下書きなら「下書き」、公開から日が浅ければ「新着」も付ける）と、読む時間の目安 */
function PostDate({ post, className }: { post: Post; className?: string }) {
  const date =
    !post.draft && post.publishedAt ? new Date(post.publishedAt) : null
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2">
      {post.draft && <DraftBadge />}
      {date && (
        <time dateTime={date.toISOString()} className={className}>
          {formatDate(date)}
        </time>
      )}
      {date && isRecent(date) && <NewBadge />}
      <span className={className}>約 {post.readingMinutes} 分</span>
    </span>
  )
}

type PostsProps = {
  posts: Post[]
  /** まとまりの見出し（h2）の下に並ぶとき */
  grouped: boolean
}

function PostList({ posts, grouped }: PostsProps) {
  const Title = grouped ? 'h3' : 'h2'
  return (
    <ul className="divide-y">
      {posts.map((post) => (
        <li key={post.slug} id={listItemId(post.slug)} className="scroll-mt-32">
          <Link
            to="/blog/$slug"
            params={{ slug: post.slug }}
            className="group flex gap-4 py-6 sm:gap-6"
          >
            <div className="min-w-0 flex-1">
              <PostDate post={post} className="text-sm text-muted-foreground" />
              <Title className="mt-1 text-lg font-semibold group-hover:underline sm:text-xl">
                {post.title}
              </Title>
              {post.excerpt && (
                <p className="mt-2 line-clamp-3 text-sm text-muted-foreground sm:text-base">
                  {post.excerpt}
                </p>
              )}
            </div>
            {post.coverImageKey && (
              <img
                src={thumbnailUrl(post.coverImageKey) ?? undefined}
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

function PostCards({ posts, grouped }: PostsProps) {
  const Title = grouped ? 'h3' : 'h2'
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {posts.map((post) => (
        <li key={post.slug} id={listItemId(post.slug)} className="scroll-mt-32">
          <Link
            to="/blog/$slug"
            params={{ slug: post.slug }}
            className="group flex h-full flex-col overflow-hidden rounded-lg border transition-colors hover:bg-muted/40"
          >
            <div className="aspect-[4/3] overflow-hidden border-b bg-muted/30">
              {post.coverImageKey && (
                <img
                  src={thumbnailUrl(post.coverImageKey) ?? undefined}
                  alt=""
                  loading="lazy"
                  className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
              )}
            </div>
            <div className="flex flex-1 flex-col gap-1 p-4">
              <PostDate post={post} className="text-xs text-muted-foreground" />
              <Title className="font-semibold group-hover:underline">
                {post.title}
              </Title>
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

function PostTable({
  groups,
  list,
}: {
  groups: readonly Group<Post>[]
  list: ListControls
}) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full min-w-[32rem] text-sm">
        <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
          <tr>
            <SortableHeader list={list} column="title">
              タイトル
            </SortableHeader>
            <SortableHeader list={list} column="date">
              公開日
            </SortableHeader>
          </tr>
        </thead>
        {groups.map((group) => (
          <tbody key={group.key}>
            {groups.length > 1 && <TableGroupRow group={group} colSpan={2} />}
            {group.items.map((post) => (
              <tr
                key={post.slug}
                id={listItemId(post.slug)}
                className="scroll-mt-32 border-t hover:bg-muted/30"
              >
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
        ))}
      </table>
    </div>
  )
}
