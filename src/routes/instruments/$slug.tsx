import { createFileRoute } from '@tanstack/react-router'

import {
  CollectionDetail,
  CollectionNotFound,
} from '@/components/collection-view'
import { collectionDetailHead } from '@/lib/collection-seo'
import { getPublishedItem } from '@/server/collections'

export const Route = createFileRoute('/instruments/$slug')({
  loader: ({ params }) =>
    getPublishedItem({ data: { kind: 'instrument', slug: params.slug } }),
  staticData: { breadcrumb: (match) => match.loaderData?.title },
  head: ({ loaderData }) => collectionDetailHead('instrument', loaderData),
  component: Page,
  notFoundComponent: () => <CollectionNotFound kind="instrument" />,
})

function Page() {
  const item = Route.useLoaderData()
  return <CollectionDetail kind="instrument" item={item} />
}
