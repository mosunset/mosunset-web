import { createFileRoute } from '@tanstack/react-router'

import { CollectionForm } from '@/components/admin/collection-form'
import { collections } from '@/lib/collections'

export const Route = createFileRoute('/admin/collections/$kind/new')({
  staticData: { breadcrumb: '追加' },
  component: NewItem,
})

function NewItem() {
  const { kind } = Route.useParams()
  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8">
      <h1 className="mb-8 text-3xl font-bold">
        {collections[kind].label}を追加
      </h1>
      <CollectionForm key={kind} kind={kind} />
    </div>
  )
}
