import { createFileRoute } from '@tanstack/react-router'

import {
  CollectionDetail,
  CollectionNotFound,
} from '@/components/collection-view'
import { collections } from '@/lib/collections'
import { seo } from '@/lib/seo'
import { getPublishedItem } from '@/server/collections'

export const Route = createFileRoute('/toys/$slug')({
  loader: ({ params }) =>
    getPublishedItem({ data: { kind: 'toy', slug: params.slug } }),
  staticData: { breadcrumb: (match) => match.loaderData?.title },
  head: ({ loaderData }) => ({
    meta: loaderData
      ? seo({
          title: `${loaderData.title}（${collections.toy.label}）`,
          description: `${collections.toy.label}のコレクション「${loaderData.title}」`,
        })
      : seo({ title: '見つかりません', noindex: true }),
  }),
  component: Page,
  notFoundComponent: () => <CollectionNotFound kind="toy" />,
})

function Page() {
  const item = Route.useLoaderData()
  return <CollectionDetail kind="toy" item={item} />
}
