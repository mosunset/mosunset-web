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
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <h1 className="mb-6 text-2xl font-bold sm:mb-8 sm:text-3xl">
        {collections[kind].label}を追加
      </h1>
      <CollectionForm key={kind} kind={kind} />
    </div>
  )
}
