/** サイト全体の基本情報。SEO・OGP・ヘッダーなどで共通して使う */
export const site = {
  name: 'mosunset',
  /** 正規の URL。canonical / OGP / sitemap はすべてこれを基準にする（末尾スラッシュなし） */
  url: 'https://mosunset.com',
  description: 'mosunset の Web サイトです。',
  locale: 'ja_JP',
  themeColor: '#ffffff',
  /** public/ に置いた画像のパス */
  image: {
    path: '/my.webp',
    type: 'image/webp',
    width: 824,
    height: 824,
    alt: 'mosunset のアイコン（コアラ）',
  },
} as const

/** sitemap.xml に載せるページ */
export const sitemapPaths = ['/', '/about'] as const
