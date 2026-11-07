import type { ComponentProps } from 'react'

import { site } from '@/lib/site'

type SeoOptions = {
  /** ページ名。省略するとサイト名だけになる */
  title?: string
  description?: string
  /** 検索結果に載せない */
  noindex?: boolean
}

/** 「ページ名 | サイト名」の形にする */
function formatTitle(title?: string) {
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

/** 第一階層ページ（ナビゲーションの項目）の head */
export function sectionHead(item: { title: string; description: string }) {
  return {
    meta: seo({ title: item.title, description: item.description }),
  }
}

/** サイト内のパスを正規の絶対 URL にする（/about → https://mosunset.com/about） */
export function absoluteUrl(path: string) {
  return `${site.url}${path}`
}

/** 末尾のスラッシュを取り除く（/test/ → /test） */
export function normalizePath(pathname: string) {
  return pathname.replace(/(.)\/$/, '$1')
}

/** 太字やリンクなど、文の途中に入るタグ */
const INLINE_TAG = /<\/?(?:strong|em|b|i|u|s|a|code|span|mark)\b[^>]*>/g

/** 本文の HTML から、description に使える短いプレーンテキストを作る */
export function htmlToSummary(html: string, max = 120) {
  const text = html
    // 文中のタグは詰め、段落や箇条書きの区切りは空白にする
    .replace(INLINE_TAG, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

/** SNS のカードに使う画像（サイト共通の画像を上書きする） */
export function ogImage(path: string, alt: string, large = true) {
  const url = absoluteUrl(path)
  return [
    { property: 'og:image', content: url },
    { property: 'og:image:alt', content: alt },
    { name: 'twitter:image', content: url },
    { name: 'twitter:image:alt', content: alt },
    ...(large
      ? [{ name: 'twitter:card', content: 'summary_large_image' }]
      : []),
  ]
}

/**
 * 構造化データ（JSON-LD）を head に出す。
 * TanStack Router は meta の 'script:ld+json' を <script type="application/ld+json"> にするが、
 * meta の型は <meta> の属性しか知らないので、型だけ合わせる
 */
export function jsonLd(data: Record<string, unknown>) {
  return {
    'script:ld+json': { '@context': 'https://schema.org', ...data },
  } as unknown as ComponentProps<'meta'>
}

/** サイトの持ち主（構造化データで何度も参照するので @id を付ける） */
export const personId = `${site.url}/#person`
export const websiteId = `${site.url}/#website`
