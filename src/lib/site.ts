/** サイト全体の基本情報。SEO・OGP・ヘッダーなどで共通して使う */
export const site = {
  name: 'mosunset',
  /** 正規の URL。canonical / OGP / sitemap はすべてこれを基準にする（末尾スラッシュなし） */
  url: 'https://mosunset.com',
  description: 'mosunset のポートフォリオ兼ブログ。作ったもの、書いたこと、集めているものを置いています。',
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
  /** X（旧 Twitter）のアカウント。twitter:site / twitter:creator に使う */
  xHandle: '@TMoSunset0',
  /** SNS などのリンク。フッターや JSON-LD の sameAs に使う */
  social: [
    { name: 'X', url: 'https://x.com/TMoSunset0' },
    { name: 'GitHub', url: 'https://github.com/mosunset' },
  ],
} as const
