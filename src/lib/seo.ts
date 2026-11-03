import { site } from '@/lib/site'

type SeoOptions = {
  /** ページ名。省略するとサイト名だけになる */
  title?: string
  description?: string
  /** 検索結果に載せない */
  noindex?: boolean
}

/** 「ページ名 | サイト名」の形にする */
export function formatTitle(title?: string) {
  return title ? `${title} | ${site.name}` : site.name
}

/**
 * ページごとの title / description / OGP / Twitter のメタタグを作る。
 * 子ルートの meta は同じ name / property の親の meta を上書きする。
 */
export function seo({ title, description, noindex }: SeoOptions = {}) {
  const fullTitle = formatTitle(title)

  return [
    { title: fullTitle },
    { property: 'og:title', content: fullTitle },
    { name: 'twitter:title', content: fullTitle },
    ...(description
      ? [
          { name: 'description', content: description },
          { property: 'og:description', content: description },
          { name: 'twitter:description', content: description },
        ]
      : []),
    ...(noindex ? [{ name: 'robots', content: 'noindex, nofollow' }] : []),
  ]
}

/** サイト内のパスを正規の絶対 URL にする（/about → https://mosunset.com/about） */
export function absoluteUrl(path: string) {
  return `${site.url}${path}`
}

/** 末尾のスラッシュを取り除く（/test/ → /test） */
export function normalizePath(pathname: string) {
  return pathname.replace(/(.)\/$/, '$1')
}
