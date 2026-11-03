import { createFileRoute } from '@tanstack/react-router'

import { PostForm } from '@/components/admin/post-form'
import { getPostForAdmin } from '@/server/posts'

export const Route = createFileRoute('/admin/posts/$id')({
  loader: ({ params }) => getPostForAdmin({ data: { id: params.id } }),
  staticData: { breadcrumb: '編集' },
  component: EditPost,
})

function EditPost() {
  const post = Route.useLoaderData()

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
      <h1 className="mb-6 text-2xl font-bold sm:mb-8 sm:text-3xl">
        記事を編集
      </h1>
      {/* 別の記事に移ったときにフォームの状態を作り直す */}
      <PostForm key={post.id} post={post} />
    </div>
  )
}
