import { env } from 'cloudflare:workers'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'

import * as schema from './schema'

/** D1 の Drizzle クライアント。サーバー側（server function / server route）からだけ使う */
export function getDb() {
  return drizzle(env.DB, { schema })
}

export { schema }

// 公開側の取得では必ずこの条件を付ける（下書き・非公開のものを出さないように）

/** 公開済みの記事 */
export const publishedPosts = eq(schema.posts.status, 'published')

/** 公開にしたコレクションのアイテム */
export const publishedItems = eq(schema.collectionItems.published, true)
