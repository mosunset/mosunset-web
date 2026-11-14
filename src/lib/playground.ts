/**
 * プレイグラウンドのツール一覧。ツールそのものがコードなので、管理画面ではなくここで管理する。
 * ツールを足すときは、ここに 1 件追加して src/routes/playground/<slug>.tsx と
 * src/components/playground/tools/<slug>.tsx を作る。
 */
type PlaygroundTool = {
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
    thumbnail: '/playground/character-count/thumbnail.webp',
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
    thumbnail: '/playground/hash-generator/thumbnail.webp',
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
    thumbnail: '/playground/id-generators/thumbnail.webp',
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
    thumbnail: '/playground/ngram-similarity/thumbnail.webp',
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
    thumbnail: '/playground/monitor-pairing/thumbnail.webp',
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
    thumbnail: '/playground/unit-price-comparison/thumbnail.webp',
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
    thumbnail: '/playground/interactive-bmi-calculator-graph/thumbnail.webp',
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
    thumbnail: '/playground/kuromoji/thumbnail.webp',
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
    thumbnail: '/playground/webyolo/thumbnail.webp',
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
    thumbnail: '/playground/masonryimage/thumbnail.webp',
  },
  {
    slug: 'box-packing',
    name: '箱詰めシミュレーター',
    title: '箱詰めシミュレーター | 段ボール箱を床に低く積む並べ方を 3D で計算',
    description:
      '床の広さと段ボール箱の寸法・個数を入れると、なるべく低く、下から詰める並べ方を計算して 3D で表示します。箱どうしのすき間、底面の支え、横倒しの許可、壁側への重心寄せに対応し、CSV・JSON・PNG で書き出せます。',
    category: '3D・ビジュアル',
    tags: ['箱詰め', '3D', '積み付け', '段ボール', 'Three.js'],
    publishedDate: '2026-11-07',
    thumbnail: '/playground/box-packing/thumbnail.webp',
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
    thumbnail: '/playground/3dblock/thumbnail.webp',
  },
  {
    slug: 'readability-check',
    name: '文章の読みやすさチェック',
    title:
      '文章の読みやすさチェック | 長い文・漢字の多さ・同じ語尾・二重否定を色分け',
    description:
      '日本語の文章を貼るだけで、長すぎる文、漢字の多さ、同じ語尾の連続、二重否定、読点の多すぎ・少なすぎ、「の」の連続などを見つけて色分けします。読みやすさのスコアと、文の数・平均の文の長さ・漢字率も表示。文章はブラウザの中だけで調べ、サーバーには送りません。',
    category: '自然言語処理',
    tags: ['文章校正', '読みやすさ', '日本語', '形態素解析', 'テキスト解析'],
    publishedDate: '2026-11-14',
    thumbnail: '/playground/readability-check/thumbnail.svg',
  },
  {
    slug: 'furigana',
    name: 'ふりがな付け',
    title:
      'ふりがな付け | 漢字に読みを付けてルビ付き HTML・括弧・青空文庫形式で出力',
    description:
      '日本語の文章の漢字に、形態素解析（Kuromoji）で読みを付けます。送り仮名はルビから外し、ルビ付き HTML・「漢字(かんじ)」・青空文庫形式で出力できます。学年でルビを付ける漢字をしぼったり、読みを手で直したりもできます。入力した文章はサーバーに送りません。',
    category: '自然言語処理',
    tags: ['ふりがな', 'ルビ', '日本語', 'Kuromoji', 'HTML'],
    publishedDate: '2026-11-14',
    thumbnail: '/playground/furigana/thumbnail.webp',
  },
  {
    slug: 'notation-variance',
    name: '表記ゆれチェック',
    title:
      '表記ゆれチェック | 「行う／おこなう」「サーバ／サーバー」をまとめて一括でそろえる',
    description:
      '文章の中の表記ゆれ（行う／おこなう、子供／子ども、取り扱い／取扱い、サーバ／サーバー、全角・半角の英数字やカッコ）を見つけて、出てくる回数と場所を一覧にします。そろえる表記を選ぶと、一括で置き換えた文章をコピーできます。入力した文章はサーバーに送らず、ブラウザの中だけで調べます。',
    category: '自然言語処理',
    tags: ['表記ゆれ', '校正', '形態素解析', '日本語', 'テキスト解析'],
    publishedDate: '2026-11-14',
    thumbnail: '/playground/notation-variance/thumbnail.webp',
  },
  {
    slug: 'cron-expression',
    name: 'cron 式の確認',
    title: 'cron 式の確認 | 意味を日本語で説明し、次に動く日時を一覧に',
    description:
      'cron 式を入れると、「平日の 9:00 に」のように意味を日本語で説明し、次に動く日時を 10〜20 回分並べます。Linux crontab・GitHub Actions・Cloudflare Workers・秒付きの書き方とタイムゾーンを切り替えられ、おかしいところも示します。入力した式はサーバーに送りません。',
    category: 'ユーティリティ',
    tags: ['cron', 'crontab', 'スケジュール', 'GitHub Actions', 'Cloudflare'],
    publishedDate: '2026-11-14',
    thumbnail: '/playground/cron-expression/thumbnail.webp',
  },
  {
    slug: 'regex-tester',
    name: '正規表現チェッカー',
    title:
      '正規表現チェッカー | JavaScript の正規表現のマッチ・置換・split を色分けで確認',
    description:
      'JavaScript の正規表現と文章を入れると、マッチした場所とキャプチャグループ（名前付きも）を色分けして表示します。置換と split の結果、パターンの日本語の解説も。重いパターンは時間切れで止まります。入力した内容はサーバーに送りません。',
    category: 'ユーティリティ',
    tags: ['正規表現', 'RegExp', 'JavaScript', '置換', 'テキスト処理'],
    publishedDate: '2026-11-14',
    thumbnail: '/playground/regex-tester/thumbnail.webp',
  },
  {
    slug: 'jwt-decoder',
    name: 'JWT デコード',
    title:
      'JWT デコーダー | ヘッダー・ペイロードの表示、有効期限の確認、署名の検証',
    description:
      'JWT（JSON Web Token）を貼り付けると、ヘッダーとペイロードを色分けして読みやすく表示します。exp・iat・nbf を日時に直して期限切れかどうかを確かめ、HS256・RS256・ES256 などの署名も検証できます。HS256 で JWT を作ることもできます。トークンや鍵はサーバーに送らず、ブラウザの中だけで処理します。',
    category: 'ユーティリティ',
    tags: ['JWT', 'デコード', '署名検証', '認証', 'Web Crypto'],
    publishedDate: '2026-11-14',
    thumbnail: '/playground/jwt-decoder/thumbnail.svg',
  },
  {
    slug: 'encode-decode',
    name: 'エンコード・デコード',
    title:
      'Base64・URL エンコード・デコード | HTML エンティティ・Unicode エスケープ・16 進数にも対応',
    description:
      'テキストを Base64（標準 / URL-safe）・URL エンコード・HTML エンティティ・Unicode エスケープ・16 進数に変換し、逆に元へ戻します。UTF-8 と Shift_JIS を選べ、ファイルの Base64・data URL 化や画像のプレビューにも対応。入力した内容はサーバーに送りません。',
    category: 'ユーティリティ',
    tags: [
      'Base64',
      'URL エンコード',
      'デコード',
      'HTML エンティティ',
      '文字コード',
    ],
    publishedDate: '2026-11-14',
    thumbnail: '/playground/encode-decode/thumbnail.svg',
  },
  {
    slug: 'image-compress',
    name: '画像の圧縮・変換',
    title:
      '画像の圧縮・WebP 変換・EXIF 削除 | 複数の画像をまとめてブラウザで変換',
    description:
      '複数の画像をまとめて圧縮し、WebP・JPEG・PNG に変換します。画質と最大サイズを選べて、元と変換後の大きさ・削減率を比べられます。撮影位置（GPS）やカメラの機種などの EXIF を表示し、書き出した画像からは消します。画像はサーバーに送りません。',
    category: '画像・ギャラリー',
    tags: ['画像圧縮', 'WebP', 'EXIF 削除', '画像変換', 'リサイズ'],
    publishedDate: '2026-11-14',
    thumbnail: '/playground/image-compress/thumbnail.svg',
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
