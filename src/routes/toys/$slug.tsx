import { createFileRoute } from '@tanstack/react-router'

import {
  CollectionDetail,
  CollectionNotFound,
} from '@/components/collection-view'
import { collectionDetailHead } from '@/lib/collection-seo'
import { getPublishedItem } from '@/server/collections'

export const Route = createFileRoute('/toys/$slug')({
  loader: ({ params }) =>
    getPublishedItem({ data: { kind: 'toy', slug: params.slug } }),
  staticData: { breadcrumb: (match) => match.loaderData?.title },
  head: ({ loaderData }) => collectionDetailHead('toy', loaderData),
  component: Page,
  notFoundComponent: () => <CollectionNotFound kind="toy" />,
})

function Page() {
  const item = Route.useLoaderData()
  return <CollectionDetail kind="toy" item={item} />
}
