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

  if (raw.length === 13 && /^97[89]\d{10}$/.test(raw)) {
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

export type BookInfo = {
  isbn: string
  title: string
  author: string
  publisher: string
  coverUrl: string | null
  /** YYYY-MM-DD（日がわからなければ 01）。わからなければ空 */
  publishedDate: string
  /** 内容紹介（プレーンテキスト）。なければ空 */
  description: string
  /** その本のページ（Google Books・楽天ブックス） */
  link: string | null
}

/** 外部のデータベースで調べた結果。見つからないときと、使えなかったときを分ける */
export type BookSearchResult =
  | { status: 'found'; book: BookInfo }
  | { status: 'not-found' }
  | { status: 'unavailable'; message: string }

const unavailable = (message: string): BookSearchResult => ({
  status: 'unavailable',
  message,
})

/** 見つかったときだけ本の情報を返す */
export const foundBook = (result: BookSearchResult) =>
  result.status === 'found' ? result.book : null

/** 「2016-06」「2016年06月18日頃」などを YYYY-MM-DD にする */
function toDate(input: string | undefined): string {
  const m = input?.match(/(\d{4})\D*(\d{1,2})?(?:\D*(\d{1,2}))?/)
  if (!m) return ''
  const pad = (s: string | undefined) => (s ?? '1').padStart(2, '0')
  return `${m[1]}-${pad(m[2])}-${pad(m[3])}`
}

/** HTML のタグを外し、空白を整える */
function plainText(input: string | undefined): string {
  return (input ?? '')
    .replace(/<br\s*\/?>|<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export async function fromOpenBd(isbn: string): Promise<BookInfo | null> {
  const res = await fetch(`https://api.openbd.jp/v1/get?isbn=${isbn}`)
  if (!res.ok) return null
  const [book] = (await res.json()) as (null | {
    summary: {
      title: string
      author: string
      publisher: string
      pubdate: string
      cover: string
    }
    onix?: {
      CollateralDetail?: { TextContent?: { TextType: string; Text: string }[] }
    }
  })[]
  if (!book) return null
  const s = book.summary
  const texts = book.onix?.CollateralDetail?.TextContent ?? []
  return {
    isbn,
    title: s.title,
    // openBD は「姓,名 姓,名」の形なので、読みやすく整える
    author: s.author
      .split(' ')
      .filter(Boolean)
      // 「新海,誠,1973-」のような生没年は外す
      .map((name) => name.replace(/,\d{4}-(\d{4})?$/, '').replace(',', ' '))
      .join('、'),
    publisher: s.publisher.replace(/\s*\(発売\)$/, ''),
    coverUrl: s.cover || null,
    publishedDate: toDate(s.pubdate),
    // 03 は内容紹介、02 は短い説明
    description: plainText(
      (
        texts.find((t) => t.TextType === '03') ??
        texts.find((t) => t.TextType === '02')
      )?.Text,
    ),
    link: null,
  }
}

/**
 * Google Books の表紙の URL を大きい版にする。検索結果の thumbnail は幅 128px と小さいので、
 * 大きさの指定（fife）を付けて取る（2026-11 時点で幅 300px くらいまで返る）。端のめくれ（edge=curl）は外す。
 * zoom を 2 以上にするのは使わない（「画像なし」の画像が返る）
 */
export function largerGoogleCover(thumbnail: string) {
  const url = new URL(thumbnail.replace(/^http:/, 'https:'))
  url.searchParams.delete('edge')
  url.searchParams.set('fife', 'w600-h900')
  return url.toString()
}

/**
 * Google Books で ISBN から探す。
 * キー（GOOGLE_BOOKS_API_KEY）がなくても使えるが、そのときは世界中の利用者で回数を分け合うので、すぐ上限になる
 */
export async function searchGoogleBooks(
  isbn: string,
): Promise<BookSearchResult> {
  const key = process.env.GOOGLE_BOOKS_API_KEY
  const params = new URLSearchParams({ q: `isbn:${isbn}`, country: 'JP' })
  if (key) params.set('key', key)
  const res = await fetch(
    `https://www.googleapis.com/books/v1/volumes?${params}`,
  )
  if (res.status === 429) {
    return unavailable(
      key
        ? '今日使える回数を使い切りました'
        : 'キーなしで使える回数の上限です（GOOGLE_BOOKS_API_KEY を入れると使えます）',
    )
  }
  if (!res.ok) return unavailable(`エラーが返りました（${res.status}）`)
  const data = (await res.json()) as {
    items?: {
      volumeInfo: {
        title?: string
        subtitle?: string
        authors?: string[]
        publisher?: string
        publishedDate?: string
        description?: string
        infoLink?: string
        imageLinks?: { thumbnail?: string }
      }
    }[]
  }
  const v = data.items?.[0]?.volumeInfo
  if (!v?.title) return { status: 'not-found' }
  return {
    status: 'found',
    book: {
      isbn,
      title: v.subtitle ? `${v.title} : ${v.subtitle}` : v.title,
      author: (v.authors ?? []).join('、'),
      publisher: v.publisher ?? '',
      coverUrl: v.imageLinks?.thumbnail
        ? largerGoogleCover(v.imageLinks.thumbnail)
        : null,
      publishedDate: toDate(v.publishedDate),
      description: plainText(v.description),
      link: v.infoLink?.replace(/^http:/, 'https:') ?? null,
    },
  }
}

/**
 * 楽天ブックス書籍検索 API で ISBN から探す。アプリ ID（RAKUTEN_APP_ID）が要る。
 * アクセスキー（RAKUTEN_ACCESS_KEY）もあれば新しい窓口（openapi.rakuten.co.jp）を使う
 */
export async function searchRakutenBooks(
  isbn: string,
): Promise<BookSearchResult> {
  const appId = process.env.RAKUTEN_APP_ID
  if (!appId) return unavailable('アプリ ID（RAKUTEN_APP_ID）が入っていません')
  const accessKey = process.env.RAKUTEN_ACCESS_KEY
  const params = new URLSearchParams({
    applicationId: appId,
    isbn,
    format: 'json',
    formatVersion: '2',
    // 品切れのものも探す
    outOfStockFlag: '1',
  })
  if (accessKey) params.set('accessKey', accessKey)
  const host = accessKey ? 'openapi.rakuten.co.jp' : 'app.rakuten.co.jp'
  const res = await fetch(
    `https://${host}/services/api/BooksBook/Search/20170404?${params}`,
    // アプリに登録したサイトから使っていることを伝える
    { headers: { Referer: 'https://mosunset.com/' } },
  )
  const body = (await res.json().catch(() => null)) as {
    error?: string
    error_description?: string
    Items?: {
      title?: string
      subTitle?: string
      author?: string
      publisherName?: string
      salesDate?: string
      itemCaption?: string
      itemUrl?: string
      largeImageUrl?: string
    }[]
  } | null
  if (!res.ok) {
    if (body?.error === 'service_unavailable') {
      return unavailable('楽天ブックスの API がメンテナンス中です')
    }
    if (res.status === 429) return unavailable('短い間に使いすぎました')
    return unavailable(
      `エラーが返りました（${res.status}${body?.error_description ? `: ${body.error_description}` : ''}）`,
    )
  }
  const item = body?.Items?.[0]
  if (!item?.title) return { status: 'not-found' }
  return {
    status: 'found',
    book: {
      isbn,
      title: item.subTitle ? `${item.title} ${item.subTitle}` : item.title,
      author: (item.author ?? '').split('/').filter(Boolean).join('、'),
      publisher: item.publisherName ?? '',
      // ?_ex=200x200 を外すと元の大きさの画像になる
      coverUrl: item.largeImageUrl?.replace(/\?.*$/, '') || null,
      publishedDate: toDate(item.salesDate),
      description: plainText(item.itemCaption),
      link: item.itemUrl ?? null,
    },
  }
}

/** 調べた結果がないときの表紙の最後の候補（国立国会図書館のサムネイル） */
export const ndlThumbnailUrl = (isbn: string) =>
  `https://ndlsearch.ndl.go.jp/thumbnail/${isbn}.jpg`

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
