import { createServerFn } from '@tanstack/react-start'
import { and, eq, or, sql } from 'drizzle-orm'
import { z } from 'zod'

import { adminMiddleware } from '@/functions/auth'
import { getDb, schema } from '@/server/db'
import {
  type BookSearchResult,
  foundBook,
  fromOpenBd,
  ndlThumbnailUrl,
  normalizeIsbn,
  saveCover,
  searchGoogleBooks,
  searchRakutenBooks,
} from '@/server/isbn'

const { collectionItems: items } = schema

const isbnInput = (data: unknown) =>
  z.object({ isbn: z.string().max(40) }).parse(data)

function requireIsbn(input: string) {
  const isbn = normalizeIsbn(input)
  if (!isbn) throw new Error('ISBN の形式が正しくありません')
  return isbn
}

/** 外部の検索が例外で止まったときも、画面には「使えなかった」として返す */
const safely = (search: Promise<BookSearchResult>) =>
  search.catch(
    (): BookSearchResult => ({
      status: 'unavailable',
      message: 'つながりませんでした',
    }),
  )

/** ISBN から書名・著者・出版社・発行日・内容紹介・表紙を調べる（管理者のみ） */
export const lookupIsbn = createServerFn({ method: 'POST' })
  .middleware([adminMiddleware])
  .validator((data: unknown) =>
    z.object({ isbn: z.string().max(40), withCover: z.boolean() }).parse(data),
  )
  .handler(async ({ data }) => {
    const isbn = requireIsbn(data.isbn)

    const [openBd, rakuten, google] = await Promise.all([
      fromOpenBd(isbn).catch(() => null),
      safely(searchRakutenBooks(isbn)).then(foundBook),
      safely(searchGoogleBooks(isbn)).then(foundBook),
    ])
    // 書誌は openBD（国立国会図書館の記録が元）を優先し、足りないところを楽天・Google で埋める
    const sources = [openBd, rakuten, google].filter((b) => b !== null)
    if (sources.length === 0) {
      throw new Error('この ISBN の本は見つかりませんでした')
    }
    const pick = (key: 'title' | 'author' | 'publisher' | 'publishedDate') =>
      sources.find((b) => b[key])?.[key] ?? ''
    // 内容紹介は、書店の紹介文がある楽天・Google を先にする
    const description =
      [rakuten, google, openBd].find((b) => b?.description)?.description ?? ''

    let imageKey: string | null = null
    if (data.withCover) {
      // 大きいものから試す（楽天は元の大きさ、Google は幅 300px くらい、国立国会図書館は幅 120〜200px くらい）
      imageKey = await saveCover([
        rakuten?.coverUrl ?? null,
        openBd?.coverUrl ?? null,
        google?.coverUrl ?? null,
        ndlThumbnailUrl(isbn),
      ])
    }

    return {
      isbn,
      title: pick('title'),
      author: pick('author'),
      publisher: pick('publisher'),
      publishedDate: pick('publishedDate'),
      description,
      imageKey,
    }
  })

/**
 * バーコードで読んだ本を調べる（管理者のみ）。
 * もう登録しているか（非公開のものも含む）と、Google Books・楽天ブックスの結果を返す
 */
export const scanBook = createServerFn({ method: 'POST' })
  .middleware([adminMiddleware])
  .validator(isbnInput)
  .handler(async ({ data }) => {
    const isbn = requireIsbn(data.isbn)
    const [owned, google, rakuten, openBd] = await Promise.all([
      getDb()
        .select({
          slug: items.slug,
          title: items.title,
          imageKey: items.imageKey,
          published: items.published,
        })
        .from(items)
        .where(
          and(
            eq(items.kind, 'book'),
            or(
              eq(items.slug, isbn),
              // 手で入れた ISBN はハイフン付きのこともある
              sql`replace(json_extract(${items.attributes}, '$.isbn'), '-', '') = ${isbn}`,
            ),
          ),
        )
        .limit(1)
        .then((rows) => rows[0] ?? null),
      safely(searchGoogleBooks(isbn)),
      safely(searchRakutenBooks(isbn)),
      // キーが要らないので、楽天・Google が使えないときも書名だけは出せる
      fromOpenBd(isbn).catch(() => null),
    ])
    const title =
      owned?.title ??
      foundBook(rakuten)?.title ??
      foundBook(google)?.title ??
      openBd?.title ??
      null
    return { isbn, title, owned, google, rakuten }
  })
