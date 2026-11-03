import { sql } from 'drizzle-orm'
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core'

const id = () =>
  text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID())

const timestamps = {
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`)
    .$onUpdate(() => new Date()),
}

/** ブログ記事。本文は Tiptap の JSON をそのまま保存する */
export const posts = sqliteTable(
  'posts',
  {
    id: id(),
    slug: text('slug').notNull().unique(),
    title: text('title').notNull(),
    excerpt: text('excerpt').notNull().default(''),
    content: text('content', { mode: 'json' }).notNull(),
    coverImageKey: text('cover_image_key'),
    status: text('status', { enum: ['draft', 'published'] })
      .notNull()
      .default('draft'),
    publishedAt: integer('published_at', { mode: 'timestamp_ms' }),
    ...timestamps,
  },
  (t) => [index('posts_status_published_at_idx').on(t.status, t.publishedAt)],
)

export const collectionKinds = [
  'instrument',
  'certification',
  'toy',
  'book',
] as const
export type CollectionKind = (typeof collectionKinds)[number]

/**
 * 楽器・資格・おもちゃ・本のコレクション。
 * 種類ごとに違う項目（著者・ISBN・メーカーなど）は attributes に JSON で持つ。
 */
export const collectionItems = sqliteTable(
  'collection_items',
  {
    id: id(),
    kind: text('kind', { enum: collectionKinds }).notNull(),
    slug: text('slug').notNull(),
    title: text('title').notNull(),
    description: text('description', { mode: 'json' }),
    imageKey: text('image_key'),
    attributes: text('attributes', { mode: 'json' })
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    /** 入手日・取得日など */
    acquiredAt: text('acquired_at'),
    sortOrder: integer('sort_order').notNull().default(0),
    published: integer('published', { mode: 'boolean' })
      .notNull()
      .default(false),
    ...timestamps,
  },
  (t) => [
    index('collection_items_kind_idx').on(t.kind, t.sortOrder),
    uniqueIndex('collection_items_kind_slug_idx').on(t.kind, t.slug),
  ],
)

/** お問い合わせフォームの受信内容 */
export const contactMessages = sqliteTable('contact_messages', {
  id: id(),
  name: text('name').notNull(),
  email: text('email').notNull(),
  subject: text('subject').notNull().default(''),
  body: text('body').notNull(),
  readAt: integer('read_at', { mode: 'timestamp_ms' }),
  createdAt: timestamps.createdAt,
})
