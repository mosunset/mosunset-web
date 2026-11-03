import { createFileRoute } from '@tanstack/react-router'

import { PostForm } from '@/components/admin/post-form'

export const Route = createFileRoute('/admin/posts/new')({
  staticData: { breadcrumb: '新規作成' },
  component: NewPost,
})

function NewPost() {
  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-8">
      <h1 className="mb-8 text-3xl font-bold">記事を書く</h1>
      <PostForm />
    </div>
  )
}
