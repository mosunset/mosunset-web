import { House, type LucideIcon } from 'lucide-react'

import type { SiteIndex } from '@/functions/search'
import {
  type AttributeField,
  type CollectionKind,
  collections,
  displayAttribute,
  isDisplayedField,
  itemSubtitle,
} from '@/lib/collections/config'
import { thumbnailUrl } from '@/lib/images'
import { contactNav, mainNav } from '@/lib/navigation'
import { toolsVisibleTo, toolVisibility } from '@/lib/playground/tools'
import { normalizeForSearch } from '@/lib/search-text'
import type { Access, Visibility } from '@/lib/visibility'

/** サイト全体の検索で見つかるもの 1 件 */
export type SearchEntry = {
  id: string
  /** まとまり（「ページ」「ブログ」「本」など） */
  group: string
  title: string
  /** 名前の下に小さく出す説明（著者・カテゴリ・記事の抜粋など） */
  detail?: string
  href: string
  image?: string | null
  icon?: LucideIcon
  /** 公開の状態（限定公開・未公開のときに印を出す） */
  visibility?: Visibility
  /** 探すときに比べる文字（形をそろえたもの） */
  text: string
  /** 名前（形をそろえたもの）。名前で当たったものを先に出す */
  titleText: string
}

/** まとまりの順と、そのまとまりの一覧ページ（「すべて見る」の行き先） */
export const searchGroups = [
  { label: 'ページ', listPath: null },
  ...mainNav.map((n) => ({ label: n.title, listPath: n.to })),
] as const

function entry(
  e: Omit<SearchEntry, 'text' | 'titleText'>,
  words: readonly (string | null | undefined)[],
): SearchEntry {
  return {
    ...e,
    titleText: normalizeForSearch(e.title),
    text: normalizeForSearch([e.title, ...words].filter(Boolean).join(' ')),
  }
}

/** ページ（第一階層）。何も打っていないときにも出す */
export const pageEntries: readonly SearchEntry[] = [
  { title: 'ホーム', to: '/', icon: House, description: 'トップページ' },
  ...mainNav,
  contactNav,
].map((n) =>
  entry(
    {
      id: `page:${n.to}`,
      group: 'ページ',
      title: n.title,
      detail: n.description,
      href: n.to,
      icon: n.icon,
    },
    [n.description],
  ),
)

/** 道具（見ている人に見せてよいものだけ。検索の一覧を読めていないうちは公開のものだけ） */
const toolEntriesFor = (access: Access): SearchEntry[] =>
  toolsVisibleTo(access).map((t) =>
    entry(
      {
        id: `tool:${t.slug}`,
        group: 'プレイグラウンド',
        title: t.name,
        detail: t.category,
        href: `/playground/${t.slug}`,
        image: t.thumbnail,
        visibility: toolVisibility(t),
      },
      [t.title, t.description, t.category, ...t.tags],
    ),
  )

/** コレクションの項目の値（選択肢はラベルにする。URL は探す対象にしない） */
function attributeWords(
  kind: CollectionKind,
  attributes: Record<string, string>,
) {
  const fields: readonly AttributeField[] = collections[kind].fields
  return fields
    .filter((f) => isDisplayedField(f) && f.type !== 'url' && attributes[f.key])
    .map((f) => displayAttribute(f, attributes[f.key]))
}

/** 記事・道具・コレクションをまとめた、探す対象の一覧 */
export function buildEntries(index: SiteIndex | null): SearchEntry[] {
  const posts = (index?.posts ?? []).map((p) =>
    entry(
      {
        id: `post:${p.slug}`,
        group: 'ブログ',
        title: p.title,
        detail: p.excerpt ?? undefined,
        href: `/blog/${p.slug}`,
        image: thumbnailUrl(p.coverImageKey),
        visibility: p.visibility,
      },
      [p.excerpt],
    ),
  )
  const items = (index?.items ?? []).map((item) => {
    const config = collections[item.kind]
    return entry(
      {
        id: `${item.kind}:${item.slug}`,
        group: config.label,
        title: item.title,
        detail: itemSubtitle(item.kind, item.attributes) || undefined,
        href: `${config.path}/${item.slug}`,
        image: thumbnailUrl(item.imageKey),
        visibility: item.visibility,
      },
      attributeWords(item.kind, item.attributes),
    )
  })
  const tools = toolEntriesFor(index?.access ?? 'public')
  return [...pageEntries, ...posts, ...tools, ...items]
}

/** 探す言葉を、空白で区切った語に分ける（すべての語を含むものが当たる） */
export function searchWords(query: string) {
  return normalizeForSearch(query).split(/\s+/).filter(Boolean)
}

export type SearchResultGroup = {
  label: string
  listPath: string | null
  /** 当たった数（出すのは先頭の limit 件） */
  total: number
  entries: SearchEntry[]
}

/**
 * 当たったものを、まとまりごとに分けて返す。
 * まとまりの中は、名前が打った言葉で始まるもの → 名前に含むもの → 説明などに含むもの の順
 */
export function searchSite(
  entries: readonly SearchEntry[],
  query: string,
  limit = 5,
): SearchResultGroup[] {
  const words = searchWords(query)
  if (words.length === 0) return []
  const rank = (e: SearchEntry) =>
    e.titleText.startsWith(words[0])
      ? 0
      : words.every((w) => e.titleText.includes(w))
        ? 1
        : 2
  const hits = entries
    .filter((e) => words.every((w) => e.text.includes(w)))
    .map((e, i) => ({ e, i, r: rank(e) }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map(({ e }) => e)

  return searchGroups.flatMap(({ label, listPath }) => {
    const inGroup = hits.filter((e) => e.group === label)
    if (inGroup.length === 0) return []
    return [
      {
        label,
        listPath,
        total: inGroup.length,
        entries: inGroup.slice(0, limit),
      },
    ]
  })
}
