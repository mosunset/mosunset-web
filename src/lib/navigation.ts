import {
  Award,
  BookOpen,
  FlaskConical,
  Guitar,
  Mail,
  NotebookPen,
  ToyBrick,
} from 'lucide-react'

/** サイトの第一階層。ヘッダー・サイドバー・トップページ・sitemap で共通して使う */
export const mainNav = [
  {
    title: 'ブログ',
    to: '/blog',
    icon: NotebookPen,
    description: '技術のことや日々のことを書いています。',
  },
  {
    title: 'プレイグラウンド',
    to: '/playground',
    icon: FlaskConical,
    description: '技術の実験やちょっとしたデモ。',
  },
  {
    title: '楽器',
    to: '/instruments',
    icon: Guitar,
    description: '持っている楽器のコレクション。',
  },
  {
    title: '資格',
    to: '/certifications',
    icon: Award,
    description: '取得した資格の一覧。',
  },
  {
    title: 'おもちゃ',
    to: '/toys',
    icon: ToyBrick,
    description: 'フィギュア・ぬいぐるみ・ストラップなど、集めているもの。',
  },
  {
    title: '本',
    to: '/books',
    icon: BookOpen,
    description: '持っている本・読んだ本の記録。',
  },
] as const

export const contactNav = {
  title: 'お問い合わせ',
  to: '/contact',
  icon: Mail,
  description: 'サイトについてのご連絡はこちらから。',
} as const

export type NavItem = (typeof mainNav)[number] | typeof contactNav

type MainNavPath = (typeof mainNav)[number]['to']

/**
 * 第一階層のまとまり（サイドバーで見出しを付けて分ける）。
 * トップページの「作ったもの、書いたこと、集めているもの」と同じ分け方
 */
export const navGroups = [
  { label: '書いたこと', paths: ['/blog'] },
  { label: '作ったもの', paths: ['/playground'] },
  {
    label: '集めているもの',
    paths: ['/instruments', '/certifications', '/toys', '/books'],
  },
] as const satisfies readonly { label: string; paths: MainNavPath[] }[]

/** コレクション（集めているもの）の第一階層の項目 */
export const collectionNav = mainNav.filter((item) =>
  (navGroups[2].paths as readonly string[]).includes(item.to),
)

/** to から第一階層の項目を取り出す */
export function getNavItem(to: NavItem['to']): NavItem {
  const item = [...mainNav, contactNav].find((i) => i.to === to)
  if (!item) throw new Error(`Unknown nav item: ${to}`)
  return item
}
