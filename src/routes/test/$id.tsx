import { createFileRoute, notFound } from '@tanstack/react-router'

import { seo } from '@/lib/seo'

import { findTestItem } from './-data'

export const Route = createFileRoute('/test/$id')({
  loader: ({ params }) => {
    const item = findTestItem(params.id)
    if (!item) throw notFound()
    return { item }
  },
  // loader のデータからラベルを作る例
  staticData: {
    breadcrumb: (match) => match.loaderData?.item?.name,
  },
  head: ({ loaderData }) => ({
    meta: seo({
      title: loaderData?.item.name ?? '見つかりません',
      description: loaderData?.item.description,
    }),
  }),
  component: TestItemPage,
  notFoundComponent: () => (
    <div className="p-8">
      <h1 className="text-3xl font-bold">見つかりません</h1>
      <p className="mt-4 text-muted-foreground">このアイテムは存在しません。</p>
    </div>
  ),
})

function TestItemPage() {
  const { item } = Route.useLoaderData()

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold">{item.name}</h1>
      <p className="mt-4">{item.description}</p>
      <p className="mt-2 text-sm text-muted-foreground">ID: {item.id}</p>
    </div>
  )
}
