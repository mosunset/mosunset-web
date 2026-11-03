import { createFileRoute, Link } from '@tanstack/react-router'
import { Plus } from 'lucide-react'
import { useMemo, useState } from 'react'

import { ListFilter, matchesQuery } from '@/components/admin/list-filter'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatDateTime } from '@/lib/format'
import { listPostsForAdmin } from '@/server/posts'

export const Route = createFileRoute('/admin/posts/')({
  loader: () => listPostsForAdmin(),
  component: AdminPosts,
})

type Filter = 'all' | 'published' | 'draft'

const filterOptions = [
  { value: 'all', label: 'すべて' },
  { value: 'published', label: '公開中' },
  { value: 'draft', label: '下書き' },
] as const

function AdminPosts() {
  const posts = Route.useLoaderData()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')

  const visible = useMemo(
    () =>
      posts.filter(
        (post) =>
          (filter === 'all' || post.status === filter) &&
          matchesQuery(query, post.title, post.slug),
      ),
    [posts, query, filter],
  )

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold sm:text-3xl">ブログ記事</h1>
        <Button asChild>
          <Link to="/admin/posts/new">
            <Plus />
            新規作成
          </Link>
        </Button>
      </div>

      {posts.length === 0 ? (
        <p className="mt-8 rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          まだ記事はありません。「新規作成」から書き始めましょう。
        </p>
      ) : (
        <>
          <div className="mt-6">
            <ListFilter
              query={query}
              onQueryChange={setQuery}
              filter={filter}
              onFilterChange={setFilter}
              options={filterOptions}
              placeholder="タイトル・URL で検索"
            />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            {visible.length} / {posts.length} 件
          </p>

          {visible.length === 0 ? (
            <p className="mt-4 rounded-lg border border-dashed p-8 text-center text-muted-foreground">
              条件に合う記事がありません。
            </p>
          ) : (
            <ul className="mt-2 divide-y rounded-lg border">
              {visible.map((post) => (
                <li key={post.id}>
                  <Link
                    to="/admin/posts/$id"
                    params={{ id: post.id }}
                    className="flex flex-col gap-1 px-4 py-3 hover:bg-muted/30 sm:flex-row sm:items-center sm:gap-4"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium">
                          {post.title}
                        </span>
                        {post.status === 'published' ? (
                          <Badge>公開中</Badge>
                        ) : (
                          <Badge variant="secondary">下書き</Badge>
                        )}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        /blog/{post.slug}
                      </div>
                    </div>
                    <div className="flex gap-4 text-xs text-muted-foreground sm:flex-col sm:items-end sm:gap-0">
                      <span>
                        公開{' '}
                        {post.publishedAt
                          ? formatDateTime(post.publishedAt)
                          : '—'}
                      </span>
                      <span>更新 {formatDateTime(post.updatedAt)}</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}
