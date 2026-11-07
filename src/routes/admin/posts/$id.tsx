import { createFileRoute } from '@tanstack/react-router'

import { AdminPage } from '@/components/admin/admin-page'
import { PostForm } from '@/components/admin/post-form'
import { getPostForAdmin } from '@/functions/posts'

export const Route = createFileRoute('/admin/posts/$id')({
  loader: ({ params }) => getPostForAdmin({ data: { id: params.id } }),
  staticData: { breadcrumb: '編集' },
  component: EditPost,
})

function EditPost() {
  const post = Route.useLoaderData()

  return (
    <AdminPage title="記事を編集" form maxWidth="max-w-4xl">
      {/* 別の記事に移ったときにフォームの状態を作り直す */}
      <PostForm key={post.id} post={post} />
    </AdminPage>
  )
}
