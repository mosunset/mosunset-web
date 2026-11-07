import { createFileRoute, Link } from '@tanstack/react-router'
import { Plus } from 'lucide-react'

import { AdminPage } from '@/components/admin/admin-page'
import { ListFilter } from '@/components/admin/list-filter'
import { EmptyState } from '@/components/empty-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { listPostsForAdmin } from '@/functions/posts'
import { useListFilter } from '@/hooks/use-list-filter'
import { formatDateTime } from '@/lib/format'

export const Route = createFileRoute('/admin/posts/')({
  loader: () => listPostsForAdmin(),
  component: AdminPosts,
})

type Post = Awaited<ReturnType<typeof listPostsForAdmin>>[number]
type Filter = 'all' | 'published' | 'draft'

const filterOptions = [
  { value: 'all', label: 'すべて' },
  { value: 'published', label: '公開中' },
  { value: 'draft', label: '下書き' },
] as const

const listFilterOptions = {
  initialFilter: 'all' as Filter,
  matchesFilter: (post: Post, filter: Filter) =>
    filter === 'all' || post.status === filter,
  searchText: (post: Post) => [post.title, post.slug],
}

function AdminPosts() {
  const posts = Route.useLoaderData()
  const { visible, filterProps } = useListFilter(posts, listFilterOptions)

  return (
    <AdminPage
      title="ブログ記事"
      action={
        <Button asChild>
          <Link to="/admin/posts/new">
            <Plus />
            新規作成
          </Link>
        </Button>
      }
    >
      {posts.length === 0 ? (
        <EmptyState className="mt-8">
          まだ記事はありません。「新規作成」から書き始めましょう。
        </EmptyState>
      ) : (
        <>
          <div className="mt-6">
            <ListFilter
              {...filterProps}
              options={filterOptions}
              placeholder="タイトル・URL で検索"
            />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            {visible.length} / {posts.length} 件
          </p>

          {visible.length === 0 ? (
            <EmptyState className="mt-4">
              条件に合う記事がありません。
            </EmptyState>
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
    </AdminPage>
  )
}
