import { notFound } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { and, desc, eq, ne } from 'drizzle-orm'
import { z } from 'zod'

import { slugPattern } from '@/lib/slug'
import { adminMiddleware } from '@/server/auth'
import { getDb, schema } from '@/server/db'
import { deleteImagesOf, deleteReplacedImage } from '@/server/r2'
import {
  renderRichText,
  richTextDocSchema,
  sanitizeDoc,
} from '@/server/rich-text'
import { idInput } from '@/server/validation'

const { posts } = schema

// ---------------------------------------------------------------------------
// 公開側
// ---------------------------------------------------------------------------

/** 公開済みの記事一覧（新しい順） */
export const listPublishedPosts = createServerFn({ method: 'GET' }).handler(
  async () => {
    return getDb()
      .select({
        slug: posts.slug,
        title: posts.title,
        excerpt: posts.excerpt,
        coverImageKey: posts.coverImageKey,
        publishedAt: posts.publishedAt,
      })
      .from(posts)
      .where(eq(posts.status, 'published'))
      .orderBy(desc(posts.publishedAt))
  },
)

/** 公開済みの記事 1 件。本文は HTML にして返す */
export const getPublishedPost = createServerFn({ method: 'GET' })
  .validator((data: unknown) => z.object({ slug: z.string() }).parse(data))
  .handler(async ({ data }) => {
    const post = await getDb().query.posts.findFirst({
      where: and(eq(posts.slug, data.slug), eq(posts.status, 'published')),
    })
    if (!post) throw notFound()

    return {
      slug: post.slug,
      title: post.title,
      excerpt: post.excerpt,
      coverImageKey: post.coverImageKey,
      publishedAt: post.publishedAt,
      updatedAt: post.updatedAt,
      html: renderRichText(post.content),
    }
  })

// ---------------------------------------------------------------------------
// 管理側（すべて adminMiddleware 付き）
// ---------------------------------------------------------------------------

const postInputSchema = z.object({
  id: z.string().optional(),
  title: z.string().trim().min(1, 'タイトルを入力してください').max(200),
  slug: z
    .string()
    .trim()
    .min(1, 'URL を入力してください')
    .max(100)
    .regex(slugPattern, 'URL は半角英小文字・数字・ハイフンで入力してください'),
  excerpt: z.string().trim().max(300).default(''),
  coverImageKey: z.string().nullable().default(null),
  status: z.enum(['draft', 'published']),
  content: richTextDocSchema,
})

export type PostInput = z.input<typeof postInputSchema>

export const listPostsForAdmin = createServerFn({ method: 'GET' })
  .middleware([adminMiddleware])
  .handler(async () => {
    return getDb()
      .select({
        id: posts.id,
        slug: posts.slug,
        title: posts.title,
        status: posts.status,
        publishedAt: posts.publishedAt,
        updatedAt: posts.updatedAt,
      })
      .from(posts)
      .orderBy(desc(posts.updatedAt))
  })

export const getPostForAdmin = createServerFn({ method: 'GET' })
  .middleware([adminMiddleware])
  .validator((data: unknown) => idInput.parse(data))
  .handler(async ({ data }) => {
    const post = await getDb().query.posts.findFirst({
      where: eq(posts.id, data.id),
    })
    if (!post) throw notFound()
    return post
  })

export const savePost = createServerFn({ method: 'POST' })
  .middleware([adminMiddleware])
  .validator((data: unknown) => postInputSchema.parse(data))
  .handler(async ({ data }) => {
    const db = getDb()

    const duplicate = await db.query.posts.findFirst({
      columns: { id: true },
      where: data.id
        ? and(eq(posts.slug, data.slug), ne(posts.id, data.id))
        : eq(posts.slug, data.slug),
    })
    if (duplicate) {
      throw new Error(`URL「${data.slug}」はほかの記事で使われています`)
    }

    const values = {
      title: data.title,
      slug: data.slug,
      excerpt: data.excerpt,
      coverImageKey: data.coverImageKey,
      status: data.status,
      content: sanitizeDoc(data.content),
    }

    if (!data.id) {
      const [created] = await db
        .insert(posts)
        .values({
          ...values,
          publishedAt: data.status === 'published' ? new Date() : null,
        })
        .returning({ id: posts.id })
      return { id: created.id }
    }

    const current = await db.query.posts.findFirst({
      columns: { publishedAt: true, coverImageKey: true },
      where: eq(posts.id, data.id),
    })
    if (!current) throw notFound()

    await db
      .update(posts)
      .set({
        ...values,
        // 初めて公開したときの日時を公開日として残す
        publishedAt:
          data.status === 'published' && !current.publishedAt
            ? new Date()
            : current.publishedAt,
      })
      .where(eq(posts.id, data.id))
    // 表紙を差し替えた・外したときは古い画像を消す
    await deleteReplacedImage(current.coverImageKey, data.coverImageKey)
    return { id: data.id }
  })

export const deletePost = createServerFn({ method: 'POST' })
  .middleware([adminMiddleware])
  .validator((data: unknown) => idInput.parse(data))
  .handler(async ({ data }) => {
    const db = getDb()
    const current = await db.query.posts.findFirst({
      columns: { content: true, coverImageKey: true },
      where: eq(posts.id, data.id),
    })
    await db.delete(posts).where(eq(posts.id, data.id))
    // 本文に入れていた画像も消す
    await deleteImagesOf(current?.coverImageKey, current?.content)
    return { ok: true }
  })

/** 保存前の内容を公開ページと同じ HTML にする（プレビュー用） */
export const previewRichText = createServerFn({ method: 'POST' })
  .middleware([adminMiddleware])
  .validator((data: unknown) =>
    z.object({ content: richTextDocSchema }).parse(data),
  )
  .handler(({ data }) => ({
    html: renderRichText(data.content),
  }))
