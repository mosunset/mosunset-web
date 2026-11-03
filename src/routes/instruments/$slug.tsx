import { createFileRoute } from '@tanstack/react-router'

import {
  CollectionDetail,
  CollectionNotFound,
} from '@/components/collection-view'
import { collections } from '@/lib/collections'
import { seo } from '@/lib/seo'
import { getPublishedItem } from '@/server/collections'

export const Route = createFileRoute('/instruments/$slug')({
  loader: ({ params }) =>
    getPublishedItem({ data: { kind: 'instrument', slug: params.slug } }),
  staticData: { breadcrumb: (match) => match.loaderData?.title },
  head: ({ loaderData }) => ({
    meta: loaderData
      ? seo({
          title: `${loaderData.title}（${collections.instrument.label}）`,
          description: `${collections.instrument.label}のコレクション「${loaderData.title}」`,
        })
      : seo({ title: '見つかりません', noindex: true }),
  }),
  component: Page,
  notFoundComponent: () => <CollectionNotFound kind="instrument" />,
})

function Page() {
  const item = Route.useLoaderData()
  return <CollectionDetail kind="instrument" item={item} />
}
