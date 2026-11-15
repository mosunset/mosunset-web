import { createServerFn } from '@tanstack/react-start'
import { desc } from 'drizzle-orm'

import { getDb, publishedItems, publishedPosts, schema } from '@/server/db'

const { posts, collectionItems: items } = schema

/**
 * トップページの「新しいもの」。公開済みのものだけ（管理者のログイン中でも下書きは出さない）。
 * ツールはコードの中の一覧（src/lib/playground.ts）から、ページの側で選ぶ
 */
export const getHomeFeed = createServerFn({ method: 'GET' }).handler(
  async () => {
    const db = getDb()
    const [latestPosts, latestItems] = await Promise.all([
      db
        .select({
          slug: posts.slug,
          title: posts.title,
          coverImageKey: posts.coverImageKey,
          publishedAt: posts.publishedAt,
        })
        .from(posts)
        .where(publishedPosts)
        .orderBy(desc(posts.publishedAt))
        .limit(3),
      // 最近登録したもの（公開にした順ではなく、登録した順）
      db
        .select({
          kind: items.kind,
          slug: items.slug,
          title: items.title,
          imageKey: items.imageKey,
        })
        .from(items)
        .where(publishedItems)
        .orderBy(desc(items.createdAt))
        .limit(4),
    ])
    return { posts: latestPosts, items: latestItems }
  },
)
