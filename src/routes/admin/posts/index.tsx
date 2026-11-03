import { createFileRoute, Link } from '@tanstack/react-router'
import { Plus } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatDateTime } from '@/lib/format'
import { listPostsForAdmin } from '@/server/posts'

export const Route = createFileRoute('/admin/posts/')({
  loader: () => listPostsForAdmin(),
  component: AdminPosts,
})

function AdminPosts() {
  const posts = Route.useLoaderData()

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-3xl font-bold">ブログ記事</h1>
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
        <div className="mt-8 overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50 text-left text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">タイトル</th>
                <th className="px-4 py-3 font-medium">状態</th>
                <th className="px-4 py-3 font-medium">公開日</th>
                <th className="px-4 py-3 font-medium">更新日</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {posts.map((post) => (
                <tr key={post.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <Link
                      to="/admin/posts/$id"
                      params={{ id: post.id }}
                      className="font-medium hover:underline"
                    >
                      {post.title}
                    </Link>
                    <div className="text-xs text-muted-foreground">
                      /blog/{post.slug}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {post.status === 'published' ? (
                      <Badge>公開中</Badge>
                    ) : (
                      <Badge variant="secondary">下書き</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {post.publishedAt ? formatDateTime(post.publishedAt) : '—'}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {formatDateTime(post.updatedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
