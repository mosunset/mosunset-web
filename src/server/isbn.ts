import { validateImageBytes } from '@/server/images'
import { putImage } from '@/server/r2'

/** ISBN-10 / 13 をハイフンなしの ISBN-13 にする。不正なら null */
export function normalizeIsbn(input: string): string | null {
  const raw = input.replace(/[^0-9Xx]/g, '').toUpperCase()

  if (raw.length === 10) {
    const digits = raw.split('')
    const sum = digits.reduce(
      (acc, d, i) => acc + (d === 'X' ? 10 : Number(d)) * (10 - i),
      0,
    )
    if (sum % 11 !== 0) return null
    const base = `978${raw.slice(0, 9)}`
    return base + isbn13CheckDigit(base)
  }

  if (raw.length === 13 && /^\d{13}$/.test(raw)) {
    return isbn13CheckDigit(raw.slice(0, 12)) === raw[12] ? raw : null
  }
  return null
}

function isbn13CheckDigit(first12: string) {
  const sum = first12
    .split('')
    .reduce((acc, d, i) => acc + Number(d) * (i % 2 === 0 ? 1 : 3), 0)
  return String((10 - (sum % 10)) % 10)
}

type BookInfo = {
  isbn: string
  title: string
  author: string
  publisher: string
  coverUrl: string | null
}

export async function fromOpenBd(isbn: string): Promise<BookInfo | null> {
  const res = await fetch(`https://api.openbd.jp/v1/get?isbn=${isbn}`)
  if (!res.ok) return null
  const [book] = (await res.json()) as (null | {
    summary: {
      title: string
      author: string
      publisher: string
      cover: string
    }
  })[]
  if (!book) return null
  const s = book.summary
  return {
    isbn,
    title: s.title,
    // openBD は「姓,名 姓,名」の形なので、読みやすく整える
    author: s.author
      .split(' ')
      .filter(Boolean)
      .map((name) => name.replace(',', ' '))
      .join('、'),
    publisher: s.publisher.replace(/\s*\(発売\)$/, ''),
    coverUrl: s.cover || null,
  }
}

export async function fromGoogleBooks(isbn: string): Promise<BookInfo | null> {
  const res = await fetch(
    `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`,
  )
  if (!res.ok) return null
  const data = (await res.json()) as {
    items?: {
      volumeInfo: {
        title?: string
        subtitle?: string
        authors?: string[]
        publisher?: string
        imageLinks?: { thumbnail?: string }
      }
    }[]
  }
  const v = data.items?.[0]?.volumeInfo
  if (!v?.title) return null
  return {
    isbn,
    title: v.subtitle ? `${v.title} : ${v.subtitle}` : v.title,
    author: (v.authors ?? []).join('、'),
    publisher: v.publisher ?? '',
    coverUrl: v.imageLinks?.thumbnail?.replace(/^http:/, 'https:') ?? null,
  }
}

/** 表紙として保存する画像の種類 */
const coverTypes = ['image/jpeg', 'image/png', 'image/webp']

/** 表紙を取得して R2 に保存する。取れなければ null */
export async function saveCover(
  urls: (string | null)[],
): Promise<string | null> {
  for (const url of urls) {
    if (!url) continue
    try {
      const res = await fetch(url)
      const type = res.headers.get('content-type')?.split(';')[0] ?? ''
      if (!res.ok || !coverTypes.includes(type)) continue
      const body = await res.arrayBuffer()
      // 1x1 の「画像なし」画像などを避ける
      if (body.byteLength < 1000) continue
      // 大きすぎるものや、Content-Type と中身が合わないものは保存しない
      if (validateImageBytes(body, type)) continue
      return await putImage('collections-book', body, type)
    } catch {
      // 次の候補を試す
    }
  }
  return null
}
