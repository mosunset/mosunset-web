import { createFileRoute } from '@tanstack/react-router'

import { PostForm } from '@/components/admin/post-form'

export const Route = createFileRoute('/admin/posts/new')({
  staticData: { breadcrumb: '新規作成' },
  component: NewPost,
})

function NewPost() {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
      <h1 className="mb-6 text-2xl font-bold sm:mb-8 sm:text-3xl">
        記事を書く
      </h1>
      <PostForm />
    </div>
  )
}
