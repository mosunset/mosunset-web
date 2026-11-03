import { createServerFn } from '@tanstack/react-start'
import { desc, eq } from 'drizzle-orm'

import { getDb, schema } from '@/server/db'

/** 公開済みの記事一覧（新しい順） */
export const listPublishedPosts = createServerFn({ method: 'GET' }).handler(
  async () => {
    const db = getDb()
    return db
      .select({
        slug: schema.posts.slug,
        title: schema.posts.title,
        excerpt: schema.posts.excerpt,
        publishedAt: schema.posts.publishedAt,
      })
      .from(schema.posts)
      .where(eq(schema.posts.status, 'published'))
      .orderBy(desc(schema.posts.publishedAt))
  },
)
