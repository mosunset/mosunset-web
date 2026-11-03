import { createFileRoute } from '@tanstack/react-router'

import {
  CollectionDetail,
  CollectionNotFound,
} from '@/components/collection-view'
import { collectionDetailHead } from '@/lib/collection-seo'
import { getPublishedItem } from '@/server/collections'

export const Route = createFileRoute('/certifications/$slug')({
  loader: ({ params }) =>
    getPublishedItem({ data: { kind: 'certification', slug: params.slug } }),
  staticData: { breadcrumb: (match) => match.loaderData?.title },
  head: ({ loaderData }) => collectionDetailHead('certification', loaderData),
  component: Page,
  notFoundComponent: () => <CollectionNotFound kind="certification" />,
})

function Page() {
  const item = Route.useLoaderData()
  return <CollectionDetail kind="certification" item={item} />
}
