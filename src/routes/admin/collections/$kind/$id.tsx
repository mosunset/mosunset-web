import { createFileRoute, notFound } from '@tanstack/react-router'

import { AdminPage } from '@/components/admin/admin-page'
import { CollectionForm } from '@/components/admin/collection-form'
import { getItemForAdmin } from '@/functions/collections'
import { collections } from '@/lib/collections'

export const Route = createFileRoute('/admin/collections/$kind/$id')({
  loader: async ({ params }) => {
    const item = await getItemForAdmin({ data: { id: params.id } })
    // URL の種類とアイテムの種類が違うときは見つからない扱いにする
    if (item.kind !== params.kind) throw notFound()
    return item
  },
  staticData: { breadcrumb: (match) => match.loaderData?.title ?? '編集' },
  component: EditItem,
})

function EditItem() {
  const { kind } = Route.useParams()
  const item = Route.useLoaderData()
  return (
    <AdminPage title={<>{collections[kind].label}を編集</>} form>
      <CollectionForm key={item.id} kind={kind} item={item} />
    </AdminPage>
  )
}
