import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import { adminMiddleware } from '@/functions/auth'
import {
  fromGoogleBooks,
  fromOpenBd,
  normalizeIsbn,
  saveCover,
} from '@/server/isbn'

/**
 * ISBN から書名・著者・出版社・表紙を調べる（管理者のみ）
 *
 * TODO: 楽天ブックス書籍検索 API も調べる先に足す（表紙が大きく、内容紹介もある）。
 * 2026-11-15 に楽天ウェブサービスのサイトが 503 でアプリ ID を発行できなかったので、発行できたら対応する
 */
export const lookupIsbn = createServerFn({ method: 'POST' })
  .middleware([adminMiddleware])
  .validator((data: unknown) =>
    z.object({ isbn: z.string(), withCover: z.boolean() }).parse(data),
  )
  .handler(async ({ data }) => {
    const isbn = normalizeIsbn(data.isbn)
    if (!isbn) throw new Error('ISBN の形式が正しくありません')

    // Google Books は書誌と表紙の両方で使うことがあるので、1 回だけ問い合わせる
    let googleBooks: ReturnType<typeof fromGoogleBooks> | undefined
    const getGoogleBooks = () => {
      googleBooks ??= fromGoogleBooks(isbn)
      return googleBooks
    }

    const info = (await fromOpenBd(isbn)) ?? (await getGoogleBooks())
    if (!info) throw new Error('この ISBN の本は見つかりませんでした')

    let imageKey: string | null = null
    if (data.withCover) {
      // openBD に表紙がないことが多いので、Google Books の表紙も候補にする
      const googleCover = info.coverUrl
        ? null
        : await getGoogleBooks()
            .then((b) => b?.coverUrl ?? null)
            .catch(() => null)
      imageKey = await saveCover([
        info.coverUrl,
        googleCover,
        // 国立国会図書館のサムネイル
        `https://ndlsearch.ndl.go.jp/thumbnail/${isbn}.jpg`,
      ])
    }

    return { ...info, imageKey }
  })
