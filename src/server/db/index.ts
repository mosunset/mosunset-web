import { env } from 'cloudflare:workers'
import { eq, inArray } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'

import { type Access, visibleStatuses } from '@/lib/visibility'
import * as schema from './schema'

/** D1 の Drizzle クライアント。サーバー側（server function / server route）からだけ使う */
export function getDb() {
  return drizzle(env.DB, { schema })
}

export { schema }

// 公開側の取得では必ずこの条件を付ける（見せてはいけないものを出さないように）。
// 見ている人ごとの条件は postsVisibleTo / itemsVisibleTo（resolveAccess の結果を渡す）。
// サイトマップ・RSS・llms.txt・トップの新着は、だれに対しても公開のものだけ（publishedPosts / publishedItems）

/** 公開の記事 */
export const publishedPosts = eq(schema.posts.status, 'published')

/** 公開のコレクションのアイテム */
export const publishedItems = eq(schema.collectionItems.status, 'published')

/** その人に見せてよい記事（管理者はすべて＝条件なし） */
export function postsVisibleTo(access: Access) {
  if (access === 'admin') return undefined
  return inArray(schema.posts.status, [...visibleStatuses(access)])
}

/** その人に見せてよいコレクションのアイテム（管理者はすべて＝条件なし） */
export function itemsVisibleTo(access: Access) {
  if (access === 'admin') return undefined
  return inArray(schema.collectionItems.status, [...visibleStatuses(access)])
}
