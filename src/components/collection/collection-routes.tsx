import type { AnyRouteMatch } from '@tanstack/react-router'

import { listSearchValidator } from '@/components/list/list-search'
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

/**
 * コレクションのルート（/books/ と /books/$slug など）の設定のうち、ページの部品以外。
 * createFileRoute('<パス>') はコード生成のために各ファイルで呼び、部品（collection-pages.tsx）は
 * 各ファイルの component にその場で書く。そうすると、部品の JS はそのページを開いたときだけ読まれる
 * （設定はどのページでも読まれるので、ここには重いものを import しない）
 */

/** 一覧ページの設定 */
export function collectionIndexOptions(kind: CollectionKind) {
  const item = getNavItem(collections[kind].path)
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
  }
}

type Detail = Awaited<ReturnType<typeof getPublishedItem>>

/** 詳しいページの設定 */
export function collectionDetailOptions(kind: CollectionKind) {
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
  }
}
