import { createFileRoute } from '@tanstack/react-router'

import { AdminPage } from '@/components/admin/admin-page'
import { PostForm } from '@/components/admin/post-form'

export const Route = createFileRoute('/admin/posts/new')({
  staticData: { breadcrumb: '新規作成' },
  component: NewPost,
})

function NewPost() {
  return (
    <AdminPage title="記事を書く" form maxWidth="max-w-4xl">
      <PostForm />
    </AdminPage>
  )
}
