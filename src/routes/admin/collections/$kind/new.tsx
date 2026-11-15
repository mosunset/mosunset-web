import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

import { AdminPage } from '@/components/admin/admin-page'
import { CollectionForm } from '@/components/admin/collection-form'
import { collections } from '@/lib/collections/config'

export const Route = createFileRoute('/admin/collections/$kind/new')({
  staticData: { breadcrumb: '追加' },
  // 本の一覧でバーコードを読んで「登録する」を押したときに、ISBN を渡す
  validateSearch: (search: Record<string, unknown>) =>
    z
      .object({ isbn: z.string().max(40).optional().catch(undefined) })
      .parse(search),
  component: NewItem,
})

function NewItem() {
  const { kind } = Route.useParams()
  const { isbn } = Route.useSearch()
  return (
    <AdminPage title={<>{collections[kind].label}を追加</>} form>
      <CollectionForm
        key={`${kind}:${isbn ?? ''}`}
        kind={kind}
        initialIsbn={kind === 'book' ? isbn : undefined}
      />
    </AdminPage>
  )
}
