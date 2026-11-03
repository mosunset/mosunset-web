import { createFileRoute, notFound } from '@tanstack/react-router'

import { CollectionForm } from '@/components/admin/collection-form'
import { collections } from '@/lib/collections'
import { getItemForAdmin } from '@/server/collections'

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
    <div className="mx-auto w-full max-w-5xl px-6 py-8">
      <h1 className="mb-8 text-3xl font-bold">
        {collections[kind].label}を編集
      </h1>
      <CollectionForm key={item.id} kind={kind} item={item} />
    </div>
  )
}
