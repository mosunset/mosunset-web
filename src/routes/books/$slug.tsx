import { createFileRoute } from '@tanstack/react-router'

import {
  CollectionDetail,
  CollectionNotFound,
} from '@/components/collection-view'
import { collections } from '@/lib/collections'
import { seo } from '@/lib/seo'
import { getPublishedItem } from '@/server/collections'

export const Route = createFileRoute('/books/$slug')({
  loader: ({ params }) =>
    getPublishedItem({ data: { kind: 'book', slug: params.slug } }),
  staticData: { breadcrumb: (match) => match.loaderData?.title },
  head: ({ loaderData }) => ({
    meta: loaderData
      ? seo({
          title: `${loaderData.title}（${collections.book.label}）`,
          description: `${collections.book.label}のコレクション「${loaderData.title}」`,
        })
      : seo({ title: '見つかりません', noindex: true }),
  }),
  component: Page,
  notFoundComponent: () => <CollectionNotFound kind="book" />,
})

function Page() {
  const item = Route.useLoaderData()
  return <CollectionDetail kind="book" item={item} />
}
