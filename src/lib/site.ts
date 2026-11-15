/** サイト全体の基本情報。SEO・OGP・ヘッダーなどで共通して使う */
export const site = {
  name: 'mosunset',
  /** 正規の URL。canonical / OGP / sitemap はすべてこれを基準にする（末尾スラッシュなし） */
  url: 'https://mosunset.com',
  /** サイトのテーマ（トップのキャッチコピー） */
  tagline: 'たのしく、つくる。',
  description:
    'たのしく、つくる。mosunset のポートフォリオ兼ブログです。作ったツールやブログと、資格・本・楽器・おもちゃなどのコレクションを置いています。',
  /** 構造化データ（Person）の説明。特定につながる情報は書かない */
  personDescription:
    '会社員として働きながら、趣味で Web アプリや小さなツールを作っています。Chrome 拡張機能「YouTube Watch Thumbnails」の作者。',
  /** 構造化データ（Person）の得意分野 */
  knowsAbout: [
    'TypeScript',
    'React',
    'Next.js',
    'Astro',
    'Python',
    'Chrome 拡張機能',
    '業務の自動化',
  ],
  locale: 'ja_JP',
  /**
   * public/ に置いたアイコンの小さい版。ヘッダーなどで小さく出す版（64px）と、トップページで出す版（320px）。
   * 毎ページ読むので、元の大きい画像（image）は SNS のカードなどだけに使う
   */
  icon: { small: '/my-64.webp', medium: '/my-320.webp' },
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
