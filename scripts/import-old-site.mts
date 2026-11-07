/**
 * 旧サイト（Astro + Keystatic）のコンテンツを、新しいサイトの D1 / R2 に取り込む。
 *
 * - 旧サイトのファイルは Git の履歴（OLD_SITE_REV）から直接読むので、手元に旧サイトがなくても動く
 * - 何度実行しても同じ結果になる（同じ URL の記事・アイテムは、画像ごと消してから入れ直す）
 * - 今はローカル（wrangler の開発用 D1 / R2）に入れる
 *
 * 使い方: pnpm import:old-site
 */
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'

import { MarkdownManager } from '@tiptap/markdown'
import { getPlatformProxy } from 'wrangler'
import { parse as parseYaml } from 'yaml'

import { collectImageKeys, type RichTextDoc, richTextExtensions } from '../src/lib/tiptap.ts'

/** 旧サイトの main の最後のコミット */
const OLD_SITE_REV = process.env.OLD_SITE_REV ?? '0fa6d60'

// ---------------------------------------------------------------------------
// 旧サイトのファイルを読む
// ---------------------------------------------------------------------------

const git = (...args: string[]) =>
  execFileSync('git', args, { maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'ignore'] })

function listFiles(dir: string) {
  return git('ls-tree', '-r', '--name-only', OLD_SITE_REV, dir)
    .toString()
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.endsWith('.mdoc'))
}

function readText(path: string) {
  return git('show', `${OLD_SITE_REV}:${path}`).toString('utf8')
}

function readBlob(path: string): Buffer | null {
  try {
    return git('show', `${OLD_SITE_REV}:${path}`)
  } catch {
    return null
  }
}

type Frontmatter = Record<string, unknown>

function splitFrontmatter(source: string): { data: Frontmatter; body: string } {
  const m = source.replace(/^﻿/, '').match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  if (!m) return { data: {}, body: source }
  return { data: (parseYaml(m[1]) ?? {}) as Frontmatter, body: m[2].trim() }
}

/**
 * content/migration/<kind>/<name>.md があれば、旧サイトの原文の代わりに使う（手直しした版）。
 * frontmatter に書いた項目だけ上書きし、本文はまるごと置き換える
 */
function readOverride(kind: string, name: string) {
  const file = `content/migration/${kind}/${name}.md`
  if (!existsSync(file)) return null
  return splitFrontmatter(readFileSync(file, 'utf8'))
}

/** 旧サイトの原文と手直しした版を合わせる */
function loadEntry(kind: string, path: string) {
  const original = splitFrontmatter(readText(path))
  const override = readOverride(kind, slugOf(path))
  return {
    data: { ...original.data, ...(override?.data ?? {}) } as Frontmatter,
    body: override ? override.body : original.body,
    overridden: !!override,
    attributes: (override?.data.attributes ?? {}) as Record<string, string>,
  }
}

const str = (v: unknown) => (v === undefined || v === null ? '' : String(v).trim())

/** YAML の日付（文字列でも Date でも）を YYYY-MM-DD にする */
function toDay(v: unknown): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  const s = str(v)
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : ''
}

/** YYYY-MM-DD を日本時間の 0 時のミリ秒にする */
function dayToMs(day: string) {
  return day ? new Date(`${day}T00:00:00+09:00`).getTime() : null
}

/** 公開されていたか（下書き・限定公開は非公開として取り込む） */
const isPublic = (d: Frontmatter) => d.draft !== true && str(d.visibility || 'public') === 'public'

/** 旧サイトの画像パスを Git の中のパスにする */
function resolveAssetPath(src: string): string | null {
  // Markdown の中では日本語のファイル名が URL エンコードされていることがある
  try {
    src = decodeURIComponent(src)
  } catch {}
  if (src.startsWith('@assets/')) return `src/assets/${src.slice('@assets/'.length)}`
  if (src.startsWith('/')) return `public${src}`
  return null
}

// ---------------------------------------------------------------------------
// 取り込み先（wrangler の D1 / R2）
// ---------------------------------------------------------------------------

const platform = await getPlatformProxy<Env>()
const { DB: db, IMAGES: bucket } = platform.env

const contentTypes: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  avif: 'image/avif',
}

let uploaded = 0
let edited = 0
const missing: string[] = []

/** 旧サイトの画像を R2 に入れて、新しいキーを返す */
async function importImage(src: string | undefined, folder: string): Promise<string | null> {
  if (!src) return null
  const path = resolveAssetPath(str(src))
  const ext = path?.split('.').pop()?.toLowerCase() ?? ''
  const type = contentTypes[ext]
  // 番号などを隠した版を content/migration/images/ に置いてあれば、そちらを使う
  const edited = path ? `content/migration/images/${path}` : ''
  const blob = path && type ? (existsSync(edited) ? readFileSync(edited) : readBlob(path)) : null
  if (!blob) {
    missing.push(str(src))
    return null
  }
  const key = `${folder}/${randomUUID()}.${ext === 'jpeg' ? 'jpg' : ext}`
  await bucket.put(key, blob, { httpMetadata: { contentType: type } })
  uploaded++
  return key
}

// ---------------------------------------------------------------------------
// Markdown → Tiptap
// ---------------------------------------------------------------------------

const markdown = new MarkdownManager({ extensions: richTextExtensions })

function walk(node: RichTextDoc, fn: (n: RichTextDoc) => void) {
  fn(node)
  for (const child of node.content ?? []) walk(child, fn)
}

async function markdownToDoc(source: string, imageFolder: string): Promise<RichTextDoc | null> {
  // Markdoc の独自タグ（{% ... %}）は新しいエディタにないので行ごと外す
  const body = source.replace(/^\s*\{%.*%\}\s*$/gm, '').trim()
  if (!body) return null
  const doc = markdown.parse(body)

  // ページのタイトルが h1 になるので、本文に h1 があれば見出しを 1 段ずつ下げる（最大 h4）
  let hasH1 = false
  walk(doc, (n) => {
    if (n.type === 'heading' && n.attrs?.level === 1) hasH1 = true
  })
  const images: RichTextDoc[] = []
  walk(doc, (n) => {
    if (n.type === 'heading' && n.attrs) {
      const level = Number(n.attrs.level) + (hasH1 ? 1 : 0)
      n.attrs.level = Math.min(Math.max(level, 2), 4)
    }
    if (n.type === 'image') images.push(n)
  })

  // 本文の画像を R2 に入れ直す。取れなかった画像は外す
  for (const img of images) {
    const src = str(img.attrs?.src)
    if (/^https:\/\//.test(src)) continue
    const key = await importImage(src, imageFolder)
    if (img.attrs) img.attrs.src = key ? `/images/${key}` : ''
  }
  const prune = (n: RichTextDoc): RichTextDoc => ({
    ...n,
    content: n.content
      ?.filter((c) => c.type !== 'image' || str(c.attrs?.src) !== '')
      .map(prune),
  })
  return prune(doc)
}

function paragraph(text: string): RichTextDoc {
  return { type: 'paragraph', content: [{ type: 'text', text }] }
}

/** 文章の先頭に段落を足す */
function prependParagraph(doc: RichTextDoc | null, text: string): RichTextDoc | null {
  if (!text) return doc
  return { type: 'doc', content: [paragraph(text), ...(doc?.content ?? [])] }
}

// ---------------------------------------------------------------------------
// 既存の取り込み分を消す（何度実行しても同じ結果にする）
// ---------------------------------------------------------------------------

async function deletePostBySlug(slug: string) {
  const row = await db
    .prepare('SELECT id, content, cover_image_key FROM posts WHERE slug = ?')
    .bind(slug)
    .first<{ id: string; content: string; cover_image_key: string | null }>()
  if (!row) return
  const keys = [row.cover_image_key, ...collectImageKeys(JSON.parse(row.content))]
  await db.prepare('DELETE FROM posts WHERE id = ?').bind(row.id).run()
  await deleteKeys(keys)
}

async function deleteItemBySlug(kind: string, slug: string) {
  const row = await db
    .prepare('SELECT id, description, image_key FROM collection_items WHERE kind = ? AND slug = ?')
    .bind(kind, slug)
    .first<{ id: string; description: string | null; image_key: string | null }>()
  if (!row) return
  const keys = [row.image_key, ...collectImageKeys(row.description ? JSON.parse(row.description) : null)]
  await db.prepare('DELETE FROM collection_items WHERE id = ?').bind(row.id).run()
  await deleteKeys(keys)
}

async function deleteKeys(keys: (string | null)[]) {
  const targets = keys.filter((k): k is string => !!k)
  if (targets.length > 0) await bucket.delete(targets)
}

async function insertItem(item: {
  kind: string
  slug: string
  title: string
  description: RichTextDoc | null
  imageKey: string | null
  attributes: Record<string, string>
  acquiredAt: string
  published: boolean
}) {
  const attributes = Object.fromEntries(Object.entries(item.attributes).filter(([, v]) => v))
  const now = Date.now()
  await db
    .prepare(
      `INSERT INTO collection_items
        (id, kind, slug, title, description, image_key, attributes, acquired_at, sort_order, published, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
    )
    .bind(
      randomUUID(),
      item.kind,
      item.slug,
      item.title,
      item.description ? JSON.stringify(item.description) : null,
      item.imageKey,
      JSON.stringify(attributes),
      item.acquiredAt || null,
      item.published ? 1 : 0,
      dayToMs(item.acquiredAt) ?? now,
      now,
    )
    .run()
}

const slugOf = (path: string) => path.split('/').pop()?.replace(/\.mdoc$/, '') ?? ''
const summary: Record<string, { published: number; hidden: number }> = {}
const count = (label: string, published: boolean) => {
  summary[label] ??= { published: 0, hidden: 0 }
  summary[label][published ? 'published' : 'hidden']++
}

// ---------------------------------------------------------------------------
// ブログ
// ---------------------------------------------------------------------------

/** テスト用の記事は取り込まない */
const SKIP_POSTS = new Set(['test'])

for (const path of listFiles('src/content/blog')) {
  if (SKIP_POSTS.has(slugOf(path))) continue
  const { data, body, overridden } = loadEntry('blog', path)
  if (overridden) edited++
  // URL を変えたときは、前回取り込んだ古い URL の記事も消す
  const slug = str(data.slug) || slugOf(path)
  await deletePostBySlug(slugOf(path))
  await deletePostBySlug(slug)

  const published = isPublic(data)
  const publishedDay = toDay(data.publishedDate)
  const updatedDay = toDay(data.updatedDate) || publishedDay
  const content = (await markdownToDoc(body, 'posts')) ?? { type: 'doc', content: [{ type: 'paragraph' }] }
  const cover = await importImage(str(data.thumbnail), 'posts')
  const now = Date.now()

  await db
    .prepare(
      `INSERT INTO posts
        (id, slug, title, excerpt, content, cover_image_key, status, published_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      randomUUID(),
      slug,
      str(data.title) || slug,
      str(data.description).replace(/\s+/g, ' ').slice(0, 300),
      JSON.stringify(content),
      cover,
      published ? 'published' : 'draft',
      published ? (dayToMs(publishedDay) ?? now) : null,
      dayToMs(publishedDay) ?? now,
      dayToMs(updatedDay) ?? now,
    )
    .run()
  count('ブログ', published)
}

// ---------------------------------------------------------------------------
// 本
// ---------------------------------------------------------------------------

const readingStatus: Record<string, string> = { 未読: 'unread', 読書中: 'reading', 読了: 'read' }

for (const path of listFiles('src/content/books')) {
  const slug = slugOf(path)
  const { data, body } = splitFrontmatter(readText(path))
  await deleteItemBySlug('book', slug)
  const published = isPublic(data)
  await insertItem({
    kind: 'book',
    slug,
    title: str(data.title),
    description: prependParagraph(await markdownToDoc(body, 'collections-book'), str(data.description)),
    imageKey: await importImage(str(data.thumbnail), 'collections-book'),
    attributes: {
      // 「石川　達也/児島　悠史」→「石川 達也、児島 悠史」
      author: str(data.author).replace(/　/g, ' ').split('/').map((s) => s.trim()).filter(Boolean).join('、'),
      publisher: str(data.publisher),
      isbn: str(data.isbn) || slug,
      publishedDate: toDay(data.publishedDate),
      category: str(data.category),
      format: str(data.format),
      readingStatus: readingStatus[str(data.status)] ?? '',
    },
    acquiredAt: '',
    published,
  })
  count('本', published)
}

// ---------------------------------------------------------------------------
// 資格
// ---------------------------------------------------------------------------

const certificationStatus: Record<string, string> = {
  取得済み: 'acquired',
  学習中: 'studying',
  未取得: 'planned',
}

for (const path of listFiles('src/content/qualifications')) {
  const { data, body, overridden, attributes: overrideAttributes } = loadEntry('certifications', path)
  if (overridden) edited++
  // URL を変えたときは、前回取り込んだ古い URL のものも消す
  const slug = str(data.slug) || slugOf(path)
  await deleteItemBySlug('certification', slugOf(path))
  await deleteItemBySlug('certification', slug)
  const published = isPublic(data)
  await insertItem({
    kind: 'certification',
    slug,
    title: str(data.title) || str(data.name),
    description: await markdownToDoc(body, 'collections-certification'),
    imageKey: await importImage(str(data.thumbnail), 'collections-certification'),
    attributes: {
      status: certificationStatus[str(data.status)] ?? '',
      issuer: str(data.organization),
      category: str(data.category),
      score: str(data.score),
      credentialId: str(data.certificateNumber),
      expiresAt: toDay(data.validityPeriod),
      ...overrideAttributes,
    },
    acquiredAt: toDay(data.acquiredDate),
    published,
  })
  count('資格', published)
}

// ---------------------------------------------------------------------------
// 楽器
// ---------------------------------------------------------------------------

const instrumentStatus: Record<string, string> = { 使用中: 'using', 保管中: 'stored' }

for (const path of listFiles('src/content/instruments')) {
  const { data, body, overridden, attributes: overrideAttributes } = loadEntry('instruments', path)
  if (overridden) edited++
  const slug = str(data.slug) || slugOf(path)
  await deleteItemBySlug('instrument', slugOf(path))
  await deleteItemBySlug('instrument', slug)
  const published = isPublic(data)
  const brand = str(data.brand) === '-' ? '' : str(data.brand)

  // 追加の写真は説明文の下に並べる
  let description = await markdownToDoc(body, 'collections-instrument')
  const extra: RichTextDoc[] = []
  for (const src of (data.images as string[] | undefined) ?? []) {
    const key = await importImage(src, 'collections-instrument')
    if (key) extra.push({ type: 'image', attrs: { src: `/images/${key}`, alt: '' } })
  }
  if (extra.length > 0) {
    description = { type: 'doc', content: [...(description?.content ?? []), ...extra] }
  }

  await insertItem({
    kind: 'instrument',
    slug,
    title: str(data.title) || str(data.instrumentName) || str(data.name),
    description,
    imageKey: await importImage(str(data.thumbnail), 'collections-instrument'),
    attributes: {
      category: str(data.type),
      maker: brand,
      // メーカーがわかるものだけ、旧サイトの名前（型番）をモデルにする
      model: brand ? str(data.name) : '',
      year: str(data.manufactureYear),
      serialNumber: str(data.serialNumber),
      status: instrumentStatus[str(data.status)] ?? '',
      ...overrideAttributes,
    },
    acquiredAt: '',
    published,
  })
  count('楽器', published)
}

await platform.dispose()

console.log('取り込みました（公開 / 非公開）')
for (const [label, c] of Object.entries(summary)) {
  console.log(`  ${label}: ${c.published} / ${c.hidden}`)
}
console.log(`  画像: ${uploaded} 枚`)
console.log(`  手直しした版を使ったもの: ${edited} 件（content/migration/）`)
if (missing.length > 0) {
  console.log(`  見つからなかった画像: ${missing.length} 枚`)
  for (const m of missing) console.log(`    - ${m}`)
}
