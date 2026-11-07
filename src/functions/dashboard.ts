import { createServerFn } from '@tanstack/react-start'
import { count, desc, eq } from 'drizzle-orm'

import { adminMiddleware } from '@/functions/auth'
import type { CollectionKind } from '@/lib/collection-kinds'
import { getDb, schema } from '@/server/db'

const { posts, collectionItems, contactMessages } = schema

/** 管理画面トップの集計（未読のお問い合わせの数は /admin の loader で取っている） */
export const getDashboard = createServerFn({ method: 'GET' })
  .middleware([adminMiddleware])
  .handler(async () => {
    const db = getDb()

    const [postCounts, collectionCounts, recentDrafts, recentMessages] =
      await Promise.all([
        db
          .select({ status: posts.status, value: count() })
          .from(posts)
          .groupBy(posts.status),
        db
          .select({ kind: collectionItems.kind, value: count() })
          .from(collectionItems)
          .groupBy(collectionItems.kind),
        db
          .select({
            id: posts.id,
            title: posts.title,
            updatedAt: posts.updatedAt,
          })
          .from(posts)
          .where(eq(posts.status, 'draft'))
          .orderBy(desc(posts.updatedAt))
          .limit(5),
        db
          .select({
            id: contactMessages.id,
            name: contactMessages.name,
            subject: contactMessages.subject,
            readAt: contactMessages.readAt,
            createdAt: contactMessages.createdAt,
          })
          .from(contactMessages)
          .orderBy(desc(contactMessages.createdAt))
          .limit(5),
      ])

    return {
      posts: {
        published: postCounts.find((c) => c.status === 'published')?.value ?? 0,
        draft: postCounts.find((c) => c.status === 'draft')?.value ?? 0,
      },
      collections: Object.fromEntries(
        collectionCounts.map((c) => [c.kind, c.value]),
      ) as Partial<Record<CollectionKind, number>>,
      recentDrafts,
      recentMessages,
    }
  })
