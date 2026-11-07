import { createFileRoute } from '@tanstack/react-router'

import { AdminPage } from '@/components/admin/admin-page'
import { CollectionForm } from '@/components/admin/collection-form'
import { collections } from '@/lib/collections'

export const Route = createFileRoute('/admin/collections/$kind/new')({
  staticData: { breadcrumb: '追加' },
  component: NewItem,
})

function NewItem() {
  const { kind } = Route.useParams()
  return (
    <AdminPage title={<>{collections[kind].label}を追加</>} form>
      <CollectionForm key={kind} kind={kind} />
    </AdminPage>
  )
}
