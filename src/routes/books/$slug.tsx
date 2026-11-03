import { createFileRoute } from '@tanstack/react-router'

import {
  CollectionDetail,
  CollectionNotFound,
} from '@/components/collection-view'
import { collectionDetailHead } from '@/lib/collection-seo'
import { getPublishedItem } from '@/server/collections'

export const Route = createFileRoute('/books/$slug')({
  loader: ({ params }) =>
    getPublishedItem({ data: { kind: 'book', slug: params.slug } }),
  staticData: { breadcrumb: (match) => match.loaderData?.title },
  head: ({ loaderData }) => collectionDetailHead('book', loaderData),
  component: Page,
  notFoundComponent: () => <CollectionNotFound kind="book" />,
})

function Page() {
  const item = Route.useLoaderData()
  return <CollectionDetail kind="book" item={item} />
}
