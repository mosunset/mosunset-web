/**
 * プレイグラウンドのツール一覧。ツールそのものがコードなので、管理画面ではなくここで管理する。
 * ツールを足すときは、ここに 1 件追加して src/routes/playground/<slug>.tsx と
 * src/components/playground/tools/<slug>.tsx を作る。
 */
export type PlaygroundTool = {
  slug: PlaygroundSlug
  /** 一覧のカードに出す短い名前 */
  name: string
  /** ページの title（検索結果に出る） */
  title: string
  description: string
  category: string
  tags: readonly string[]
  publishedDate: string
  /** public/ のサムネイル */
  thumbnail: string
}

export const playgroundTools = [
  {
    slug: 'character-count',
    name: '文字数カウント',
    title:
      '文字数カウント | 文字数・行数・バイト数・原稿用紙換算をリアルタイムに',
    description:
      'テキストを入力するだけで、文字数・行数・バイト数をリアルタイムに数えます。改行や空白を除いた文字数、UTF-8 / UTF-16 / Shift_JIS のバイト数も表示。入力した文字はサーバーに送りません。',
    category: 'ユーティリティ',
    tags: ['文字数', 'カウント', '原稿用紙', 'バイト数', '文字コード'],
    publishedDate: '2025-01-27',
    thumbnail: '/playground/character-count/thumbnail.png',
  },
  {
    slug: 'hash-generator',
    name: 'ハッシュ生成',
    title: 'ハッシュ生成ツール | MD5・SHA1・SHA256 などのハッシュ計算',
    description:
      'テキストの MD5・SHA-1・SHA-224・SHA-256・SHA-384・SHA-512・RIPEMD-160 などのハッシュ値をリアルタイムに計算します。md5(md5_hex)、md5-half、MySQL 4.1+ などのカスタムハッシュにも対応。',
    category: 'ユーティリティ',
    tags: ['ハッシュ', 'MD5', 'SHA', 'JavaScript'],
    publishedDate: '2025-01-27',
    thumbnail: '/playground/hash-generator/thumbnail.png',
  },
  {
    slug: 'id-generators',
    name: 'ID ジェネレーター',
    title: 'ID Generators | UUID v4/v7・ULID・Cuid2・NanoID',
    description:
      'UUID v4 / v7・ULID・Cuid2・NanoID をその場で生成してコピーできます。ID の設計の比較や動作確認に。',
    category: 'ユーティリティ',
    tags: ['UUID', 'ULID', 'Cuid2', 'NanoID', 'JavaScript'],
    publishedDate: '2025-11-04',
    thumbnail: '/playground/id-generators/thumbnail.png',
  },
  {
    slug: 'ngram-similarity',
    name: 'n-gram 類似度',
    title: 'n-gram 類似度計算ツール (Jaccard / Dice)',
    description:
      '2 つのテキストの類似度を、n-gram の Jaccard 係数・Dice 係数で計算して比べます。n = 2〜10 に対応し、共通部分も見える化します。',
    category: 'ユーティリティ',
    tags: ['自然言語処理', 'NLP', '類似度', 'Jaccard', 'Dice', 'n-gram'],
    publishedDate: '2025-11-27',
    thumbnail: '/playground/ngram-similarity/thumbnail.png',
  },
  {
    slug: 'monitor-pairing',
    name: 'モニタペアリング',
    title:
      'モニタペアリング・シミュレーター | 中央とサイドモニタの高さマッチングツール',
    description:
      '横置きの中央モニタと縦置きのサイドモニタで、物理的な高さが近い組み合わせを探します。高さの差・PPI の差・解像度で絞り込め、サイズ感を図で確かめられます。',
    category: 'ユーティリティ',
    tags: ['モニタ', '計算', 'シミュレーター', 'ペアリング'],
    publishedDate: '2025-01-27',
    thumbnail: '/playground/monitor-pairing/thumbnail.png',
  },
  {
    slug: 'unit-price-comparison',
    name: '単価比較',
    title: 'どっちがお得？ 単価比較ツール | 単位をそろえて最安値をすぐ判定',
    description:
      '2〜6 個の商品の価格と量を入れると、100g・100ml・1 個あたりの価格にそろえて、いちばんお得なものと何 % 高いかを示します。g と kg、ml と L の換算や、まとめ売りの入数にも対応。',
    category: 'ライフスタイル',
    tags: ['価格比較', '買い物', '計算ツール', '単価計算'],
    publishedDate: '2025-01-27',
    thumbnail: '/playground/unit-price-comparison/thumbnail.png',
  },
  {
    slug: 'autophagy-clock',
    name: 'オートファジー時計',
    title: 'オートファジー時計 | 16 時間断食タイマー',
    description:
      '16 時間断食（オートファジー）のタイマーです。食事の時間（12:00〜20:00）と断食の時間をリアルタイムに表示し、進み具合をリングで確かめられます。',
    category: 'ライフスタイル',
    tags: ['オートファジー', '断食', '健康', 'タイマー'],
    publishedDate: '2025-09-01',
    thumbnail: '/playground/autophagy-clock/thumbnail.svg',
  },
  {
    slug: 'interactive-bmi-calculator-graph',
    name: 'BMI グラフ',
    title:
      'インタラクティブ BMI 計算グラフ | 身長・体重でわかる理想体重と健康チェック',
    description:
      '身長と体重をスライダーで動かすと、BMI と肥満度の判定がグラフ上ですぐにわかります。目標体重までの差も表示します。',
    category: '健康・フィットネス',
    tags: ['BMI', 'ヘルスケア', 'グラフ', 'インタラクティブ'],
    publishedDate: '2025-09-13',
    thumbnail: '/playground/interactive-bmi-calculator-graph/thumbnail.png',
  },
  {
    slug: 'kuromoji',
    name: 'Kuromoji 形態素解析',
    title: 'Kuromoji | 日本語形態素解析デモ・ブラウザ音声入力対応',
    description:
      '日本語の文章を、名詞・動詞・形容詞などの品詞に分解する形態素解析のデモです。ブラウザの音声認識を使って、話した内容もその場で解析できます。',
    category: '自然言語処理',
    tags: ['NLP', '形態素解析', '日本語', 'テキスト解析'],
    publishedDate: '2025-09-12',
    thumbnail: '/playground/kuromoji/thumbnail.png',
  },
  {
    slug: 'webyolo',
    name: 'ブラウザで物体認識',
    title: 'ブラウザで物体認識 | カメラ・画像に写ったものを AI で見つけるデモ',
    description:
      'カメラの映像や画像に写ったものを、ブラウザの中だけで見つけて枠とラベルを付けるデモです。TensorFlow.js の COCO-SSD で、人・車・犬・カップなど 80 種類を認識します。',
    category: 'AI・人工知能',
    tags: ['AI', '物体認識', 'TensorFlow.js', 'ブラウザ AI'],
    publishedDate: '2025-09-11',
    thumbnail: '/playground/webyolo/thumbnail.png',
  },
  {
    slug: 'masonryimage',
    name: 'Masonry レイアウト',
    title: 'MasonryImage | レンガ風の画像レイアウトデモ',
    description:
      '高さの違う画像を、Pinterest のようにすき間なく並べるレイアウトのデモです。画面の幅に合わせて列の数が変わります。',
    category: '画像・ギャラリー',
    tags: ['画像', 'Masonry', 'ギャラリー', 'レイアウト'],
    publishedDate: '2025-09-10',
    thumbnail: '/playground/masonryimage/thumbnail.png',
  },
  {
    slug: '3dblock',
    name: '3D ブロック',
    title: '3DBlock | 建物のボリュームを 3D で確かめるブロック・木組みデモ',
    description:
      '奥行き・スパン・階数と、それぞれの長さをスライダーで変えて、建物のボリュームを 3D で確かめられます。木組み（柱と梁）とブロックの 2 通りで表示し、寸法・延べ床面積・体積も計算します。',
    category: '3D・ビジュアル',
    tags: ['3D', 'ブロック', 'インタラクティブ', 'WebGL', 'Three.js'],
    publishedDate: '2025-09-09',
    thumbnail: '/playground/3dblock/thumbnail.png',
  },
] as const satisfies readonly (Omit<PlaygroundTool, 'slug'> & {
  slug: string
})[]

export type PlaygroundSlug = (typeof playgroundTools)[number]['slug']

export function getPlaygroundTool(slug: PlaygroundSlug): PlaygroundTool {
  const tool = playgroundTools.find((t) => t.slug === slug)
  if (!tool) throw new Error(`Unknown playground tool: ${slug}`)
  return tool
}

export const playgroundCategories = [
  ...new Set(playgroundTools.map((t) => t.category)),
]
