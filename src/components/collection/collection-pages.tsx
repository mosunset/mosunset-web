import { getRouteApi } from '@tanstack/react-router'
import { lazy, Suspense } from 'react'

import {
  CollectionDetail,
  CollectionGrid,
} from '@/components/collection/collection-view'
import { SectionPage } from '@/components/common/section-page'
import type { ListSearch } from '@/components/list/list-search'
import { type CollectionKind, collections } from '@/lib/collections/config'
import { getNavItem } from '@/lib/navigation'

/**
 * コレクションのページの部品。各ルートのファイルの component から使う
 * （ルートの設定は collection-routes.tsx）
 */

// バーコードの読み取りは管理者しか使わないので、押せるようになってから読み込む
const BookScanner = lazy(() =>
  import('@/components/collection/book-scanner').then((m) => ({
    default: m.BookScanner,
  })),
)

/** 一覧ページ（/books/ など） */
export function CollectionIndexPage({ kind }: { kind: CollectionKind }) {
  const config = collections[kind]
  const route = getRouteApi(`${config.path}/`)
  const { items, admin } = route.useLoaderData()
  const search = route.useSearch() as ListSearch
  return (
    <SectionPage item={getNavItem(config.path)}>
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

/** 詳しいページ（/books/$slug など） */
export function CollectionDetailPage({ kind }: { kind: CollectionKind }) {
  const item = getRouteApi(collections[kind].detailPath).useLoaderData()
  return <CollectionDetail kind={kind} item={item} />
}
