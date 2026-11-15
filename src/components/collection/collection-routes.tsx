import { type AnyRouteMatch, getRouteApi } from '@tanstack/react-router'

import {
  CollectionDetail,
  CollectionGrid,
  CollectionNotFound,
} from '@/components/collection/collection-view'
import { type ListSearch, listSearchValidator } from '@/components/list-view'
import { SectionPage } from '@/components/section-page'
import { getPublishedItem, listPublishedItems } from '@/functions/collections'
import { collectionDetailHead } from '@/lib/collection-seo'
import {
  type CollectionKind,
  collections,
  facetKeysOf,
} from '@/lib/collections'
import { getNavItem } from '@/lib/navigation'
import { sectionHead } from '@/lib/seo'

/**
 * コレクションの一覧ページ（/books/ など）の設定。
 * createFileRoute('<パス>') はコード生成のために各ファイルで呼ぶので、中身だけをここで作る
 */
export function collectionIndexRoute(kind: CollectionKind) {
  const config = collections[kind]
  const item = getNavItem(config.path)
  const route = getRouteApi(`${config.path}/`)

  function Page() {
    const items = route.useLoaderData()
    const search = route.useSearch() as ListSearch
    return (
      <SectionPage item={item}>
        <CollectionGrid kind={kind} items={items} search={search} />
      </SectionPage>
    )
  }

  return {
    head: () => sectionHead(item),
    validateSearch: listSearchValidator(facetKeysOf(kind)),
    loader: () => listPublishedItems({ data: { kind } }),
    component: Page,
  }
}

type Detail = Awaited<ReturnType<typeof getPublishedItem>>

/** コレクションの詳細ページ（/books/$slug など）の設定 */
export function collectionDetailRoute(kind: CollectionKind) {
  const route = getRouteApi(collections[kind].detailPath)

  function Page() {
    const item = route.useLoaderData()
    return <CollectionDetail kind={kind} item={item} />
  }

  return {
    loader: ({ params }: { params: { slug: string } }) =>
      getPublishedItem({ data: { kind, slug: params.slug } }),
    staticData: {
      breadcrumb: (match: AnyRouteMatch) => match.loaderData?.title,
      editHref: (match: AnyRouteMatch) =>
        match.loaderData?.editId
          ? `/admin/collections/${kind}/${match.loaderData.editId}`
          : undefined,
    },
    head: ({ loaderData }: { loaderData?: Detail }) =>
      collectionDetailHead(kind, loaderData),
    component: Page,
    notFoundComponent: () => <CollectionNotFound kind={kind} />,
  }
}
