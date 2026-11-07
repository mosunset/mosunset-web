import { notFound } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { and, asc, desc, eq, ne } from 'drizzle-orm'
import { z } from 'zod'
import { adminMiddleware } from '@/functions/auth'
import { collectionKinds } from '@/lib/collection-kinds'
import {
  type AttributeField,
  type CollectionAttributes,
  collections,
} from '@/lib/collections'
import { getDb, publishedItems, schema } from '@/server/db'
import { deleteImagesOf, deleteReplacedImage } from '@/server/r2'
import {
  htmlToSummary,
  renderRichText,
  richTextDocSchema,
  sanitizeDoc,
} from '@/server/rich-text'
import { idInput, optionalSlugSchema } from '@/server/validation'

const { collectionItems: items } = schema

/** 一覧の並び順（手で決めた順 → 入手日の新しい順 → 登録の新しい順） */
const listOrder = [
  asc(items.sortOrder),
  desc(items.acquiredAt),
  desc(items.createdAt),
]

const kindSchema = z.enum(collectionKinds)
const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, '日付は YYYY-MM-DD で入力してください')

/** 種類ごとの項目定義から attributes の検証スキーマを作る */
function attributeSchema(field: AttributeField) {
  switch (field.type) {
    case 'url':
      return z.union([
        z.literal(''),
        z.url(`${field.label}は URL で入力してください`),
      ])
    case 'date':
      return z.union([z.literal(''), dateString])
    case 'select':
      return z.union([
        z.literal(''),
        z.enum(field.options.map((o) => o.value) as [string, ...string[]]),
      ])
    default:
      return z.string().trim().max(200)
  }
}

function parseAttributes(
  kind: keyof typeof collections,
  input: Record<string, unknown>,
): CollectionAttributes {
  const result: CollectionAttributes = {}
  for (const field of collections[kind].fields) {
    const value = attributeSchema(field).parse(input[field.key] ?? '')
    if (value) result[field.key] = value
  }
  return result
}

function toAttributes(value: unknown): CollectionAttributes {
  return value && typeof value === 'object'
    ? (value as CollectionAttributes)
    : {}
}

/** 取り出した行の attributes を表示用の形にそろえる */
function withAttributes<T extends { attributes: unknown }>(row: T) {
  return { ...row, attributes: toAttributes(row.attributes) }
}

// ---------------------------------------------------------------------------
// 公開側
// ---------------------------------------------------------------------------

export const listPublishedItems = createServerFn({ method: 'GET' })
  .validator((data: unknown) => z.object({ kind: kindSchema }).parse(data))
  .handler(async ({ data }) => {
    const rows = await getDb()
      .select({
        slug: items.slug,
        title: items.title,
        imageKey: items.imageKey,
        attributes: items.attributes,
        acquiredAt: items.acquiredAt,
      })
      .from(items)
      .where(and(eq(items.kind, data.kind), publishedItems))
      .orderBy(...listOrder)
    return rows.map(withAttributes)
  })

export const getPublishedItem = createServerFn({ method: 'GET' })
  .validator((data: unknown) =>
    z.object({ kind: kindSchema, slug: z.string() }).parse(data),
  )
  .handler(async ({ data }) => {
    const item = await getDb().query.collectionItems.findFirst({
      where: and(
        eq(items.kind, data.kind),
        eq(items.slug, data.slug),
        publishedItems,
      ),
    })
    if (!item) throw notFound()
    const html = item.description ? renderRichText(item.description) : ''
    return {
      slug: item.slug,
      title: item.title,
      imageKey: item.imageKey,
      attributes: toAttributes(item.attributes),
      acquiredAt: item.acquiredAt,
      updatedAt: item.updatedAt,
      html,
      /** description や SNS のカードに使う、本文の最初の一部 */
      summary: htmlToSummary(html),
    }
  })

// ---------------------------------------------------------------------------
// 管理側（すべて adminMiddleware 付き）
// ---------------------------------------------------------------------------

const itemInputSchema = z.object({
  id: z.string().optional(),
  kind: kindSchema,
  title: z.string().trim().min(1, '名前を入力してください').max(200),
  /** 空なら自動で作る */
  slug: optionalSlugSchema,
  acquiredAt: z.union([z.literal(''), dateString]),
  sortOrder: z.coerce.number().int().min(-9999).max(9999).default(0),
  published: z.boolean(),
  imageKey: z.string().nullable(),
  attributes: z.record(z.string(), z.unknown()).default({}),
  description: richTextDocSchema.nullable(),
})

export const listItemsForAdmin = createServerFn({ method: 'GET' })
  .middleware([adminMiddleware])
  .validator((data: unknown) => z.object({ kind: kindSchema }).parse(data))
  .handler(async ({ data }) => {
    const rows = await getDb()
      .select({
        id: items.id,
        slug: items.slug,
        title: items.title,
        imageKey: items.imageKey,
        attributes: items.attributes,
        acquiredAt: items.acquiredAt,
        published: items.published,
        sortOrder: items.sortOrder,
        updatedAt: items.updatedAt,
      })
      .from(items)
      .where(eq(items.kind, data.kind))
      .orderBy(...listOrder)
    return rows.map(withAttributes)
  })

export const getItemForAdmin = createServerFn({ method: 'GET' })
  .middleware([adminMiddleware])
  .validator((data: unknown) => idInput.parse(data))
  .handler(async ({ data }) => {
    const item = await getDb().query.collectionItems.findFirst({
      where: eq(items.id, data.id),
    })
    if (!item) throw notFound()
    return {
      ...withAttributes(item),
      description: item.description ?? null,
    }
  })

export const saveItem = createServerFn({ method: 'POST' })
  .middleware([adminMiddleware])
  .validator((data: unknown) => itemInputSchema.parse(data))
  .handler(async ({ data }) => {
    const db = getDb()
    const id = data.id ?? crypto.randomUUID()
    const slug = data.slug || id.slice(0, 8)

    const duplicate = await db.query.collectionItems.findFirst({
      columns: { id: true },
      where: and(
        eq(items.kind, data.kind),
        eq(items.slug, slug),
        ne(items.id, id),
      ),
    })
    if (duplicate) {
      throw new Error(
        `URL「${slug}」はほかの${collections[data.kind].label}で使われています`,
      )
    }

    const values = {
      kind: data.kind,
      title: data.title,
      slug,
      acquiredAt: data.acquiredAt || null,
      sortOrder: data.sortOrder,
      published: data.published,
      imageKey: data.imageKey,
      attributes: parseAttributes(data.kind, data.attributes),
      description: data.description ? sanitizeDoc(data.description) : null,
    }

    if (!data.id) {
      await db.insert(items).values({ id, ...values })
      return { id }
    }

    const current = await db.query.collectionItems.findFirst({
      columns: { imageKey: true },
      where: eq(items.id, id),
    })
    if (!current) throw notFound()

    await db.update(items).set(values).where(eq(items.id, id))
    // 画像を差し替えた・外したときは古い画像を消す
    await deleteReplacedImage(current.imageKey, data.imageKey)
    return { id }
  })

export const deleteItem = createServerFn({ method: 'POST' })
  .middleware([adminMiddleware])
  .validator((data: unknown) => idInput.parse(data))
  .handler(async ({ data }) => {
    const db = getDb()
    const current = await db.query.collectionItems.findFirst({
      columns: { imageKey: true, description: true },
      where: eq(items.id, data.id),
    })
    await db.delete(items).where(eq(items.id, data.id))
    // 写真と、説明文に入れていた画像も消す
    await deleteImagesOf(current?.imageKey, current?.description)
    return { ok: true }
  })

/** 一覧のドラッグで決めた順番を保存する（ids の順に 0, 1, 2…） */
export const reorderItems = createServerFn({ method: 'POST' })
  .middleware([adminMiddleware])
  .validator((data: unknown) =>
    z
      .object({ kind: kindSchema, ids: z.array(z.string()).max(1000) })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const db = getDb()
    if (data.ids.length === 0) return { ok: true }
    const [first, ...rest] = data.ids.map((itemId, index) =>
      db
        .update(items)
        .set({ sortOrder: index })
        .where(and(eq(items.id, itemId), eq(items.kind, data.kind))),
    )
    // D1 の batch は 1 回の往復でまとめて実行される
    await db.batch([first, ...rest])
    return { ok: true }
  })
