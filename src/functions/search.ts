import { createServerFn } from '@tanstack/react-start'
import { asc, desc } from 'drizzle-orm'

import { publicAttributes } from '@/lib/collections/config'
import { resolveAccess } from '@/server/auth'
import { getDb, itemsVisibleTo, postsVisibleTo, schema } from '@/server/db'

const { posts, collectionItems: items } = schema

/**
 * サイト全体の検索（ヘッダーの「検索」）と、サイドバーの「今いる場所の中身」に使う、
 * 記事とコレクションの一覧。プレイグラウンドの道具はコードの中にあるので、ここには入れない
 * （どこまで見られるか access を返すので、道具はページの側でそれに合わせて絞る）。
 * 公開側の一覧と同じく、見ている人に見せてよいものだけ（src/lib/visibility.ts）
 */
export const getSiteIndex = createServerFn({ method: 'GET' }).handler(
  async () => {
    const access = await resolveAccess()
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
        .where(postsVisibleTo(access))
        .orderBy(desc(posts.publishedAt)),
      db
        .select({
          kind: items.kind,
          slug: items.slug,
          title: items.title,
          imageKey: items.imageKey,
          attributes: items.attributes,
          status: items.status,
        })
        .from(items)
        .where(itemsVisibleTo(access))
        // 公開側の一覧と同じ順（手で決めた順 → 入手日の新しい順 → 登録の新しい順）
        .orderBy(
          asc(items.sortOrder),
          desc(items.acquiredAt),
          desc(items.createdAt),
        ),
    ])
    return {
      access,
      posts: postRows.map(({ status, ...row }) => ({
        ...row,
        visibility: status,
      })),
      items: itemRows.map(({ status, attributes, ...row }) => ({
        ...row,
        attributes: publicAttributes(
          row.kind,
          attributes && typeof attributes === 'object'
            ? (attributes as Record<string, string>)
            : {},
        ),
        visibility: status,
      })),
    }
  },
)

export type SiteIndex = Awaited<ReturnType<typeof getSiteIndex>>
