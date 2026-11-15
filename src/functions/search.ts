import { createServerFn } from '@tanstack/react-start'
import { asc, desc } from 'drizzle-orm'

import { publicAttributes } from '@/lib/collections/config'
import { isAdminRequest } from '@/server/auth'
import { getDb, publishedItems, publishedPosts, schema } from '@/server/db'

const { posts, collectionItems: items } = schema

/**
 * サイト全体の検索（ヘッダーの「検索」）と、サイドバーの「今いる場所の中身」に使う、
 * 記事とコレクションの一覧。プレイグラウンドの道具はコードの中にあるので、ここには入れない。
 * 管理者のログイン中は、公開側の一覧と同じく下書きも入れる
 */
export const getSiteIndex = createServerFn({ method: 'GET' }).handler(
  async () => {
    const admin = await isAdminRequest()
    const db = getDb()
    const [postRows, itemRows] = await Promise.all([
      db
        .select({
          slug: posts.slug,
          title: posts.title,
          excerpt: posts.excerpt,
          coverImageKey: posts.coverImageKey,
          publishedAt: posts.publishedAt,
          status: posts.status,
        })
        .from(posts)
        .where(admin ? undefined : publishedPosts)
        .orderBy(desc(posts.publishedAt)),
      db
        .select({
          kind: items.kind,
          slug: items.slug,
          title: items.title,
          imageKey: items.imageKey,
          attributes: items.attributes,
          published: items.published,
        })
        .from(items)
        .where(admin ? undefined : publishedItems)
        // 公開側の一覧と同じ順（手で決めた順 → 入手日の新しい順 → 登録の新しい順）
        .orderBy(
          asc(items.sortOrder),
          desc(items.acquiredAt),
          desc(items.createdAt),
        ),
    ])
    return {
      posts: postRows.map(({ status, ...row }) => ({
        ...row,
        draft: status !== 'published',
      })),
      items: itemRows.map(({ published, attributes, ...row }) => ({
        ...row,
        attributes: publicAttributes(
          row.kind,
          attributes && typeof attributes === 'object'
            ? (attributes as Record<string, string>)
            : {},
        ),
        draft: !published,
      })),
    }
  },
)

export type SiteIndex = Awaited<ReturnType<typeof getSiteIndex>>
