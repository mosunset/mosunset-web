import { type AnyRouteMatch, getRouteApi } from '@tanstack/react-router'
import { lazy, Suspense } from 'react'

import {
  CollectionDetail,
  CollectionGrid,
  CollectionNotFound,
} from '@/components/collection/collection-view'
import { SectionPage } from '@/components/common/section-page'
import {
  type ListSearch,
  listSearchValidator,
} from '@/components/list/use-list'
import { getAdminStatus } from '@/functions/auth'
import { getPublishedItem, listPublishedItems } from '@/functions/collections'
import {
  type CollectionKind,
  collections,
  facetKeysOf,
} from '@/lib/collections/config'
import { collectionDetailHead } from '@/lib/collections/seo'
import { getNavItem } from '@/lib/navigation'
import { sectionHead } from '@/lib/seo'

// バーコードの読み取りは管理者しか使わないので、押せるようになってから読み込む
const BookScanner = lazy(() =>
  import('@/components/collection/book-scanner').then((m) => ({
    default: m.BookScanner,
  })),
)

/**
 * コレクションの一覧ページ（/books/ など）の設定。
 * createFileRoute('<パス>') はコード生成のために各ファイルで呼ぶので、中身だけをここで作る
 */
export function collectionIndexRoute(kind: CollectionKind) {
  const config = collections[kind]
  const item = getNavItem(config.path)
  const route = getRouteApi(`${config.path}/`)

  function Page() {
    const { items, admin } = route.useLoaderData()
    const search = route.useSearch() as ListSearch
    return (
      <SectionPage item={item}>
        {admin && kind === 'book' && (
          <div className="mb-4 flex justify-end">
            <Suspense fallback={null}>
              <BookScanner />
            </Suspense>
          </div>
        )}
        <CollectionGrid kind={kind} items={items} search={search} />
      </SectionPage>
    )
  }

  return {
    head: () => sectionHead(item),
    validateSearch: listSearchValidator(facetKeysOf(kind)),
    loader: async () => {
      const [items, admin] = await Promise.all([
        listPublishedItems({ data: { kind } }),
        // 本の一覧では、管理者にだけ「バーコードで調べる」を出す
        kind === 'book'
          ? getAdminStatus().then((s) => s.status === 'admin')
          : false,
      ])
      return { items, admin }
    },
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
