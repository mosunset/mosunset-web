import type { CollectionKind } from '@/lib/collection-kinds'

export {
  type CollectionKind,
  collectionKinds,
  isCollectionKind,
} from '@/lib/collection-kinds'

/** 種類ごとの追加項目の定義。管理画面の入力欄・サーバーの検証・公開ページの表示に使う */
export type AttributeField =
  | {
      key: string
      label: string
      type: 'text'
      placeholder?: string
      /** 管理画面だけで使い、公開側（ページ・検索）には送らない */
      adminOnly?: true
    }
  | { key: string; label: string; type: 'url' }
  | { key: string; label: string; type: 'date' }
  | {
      key: string
      label: string
      type: 'select'
      options: readonly { value: string; label: string }[]
    }

type CollectionConfig = {
  kind: CollectionKind
  /** 公開ページのパス（src/lib/navigation.ts と同じ） */
  path: '/instruments' | '/certifications' | '/toys' | '/books'
  detailPath:
    | '/instruments/$slug'
    | '/certifications/$slug'
    | '/toys/$slug'
    | '/books/$slug'
  label: string
  /** 入手日・取得日などの呼び方 */
  acquiredAtLabel: string
  /** 一覧のカードで名前の下に出す項目 */
  subtitleKeys: readonly string[]
  /**
   * 一覧の上に「すべて / フィギュア / ぬいぐるみ…」の絞り込みの札を出す項目（上から順に）。
   * 札は登録されている値から作り、値が 1 種類しかない項目は出さない
   */
  filterKeys?: readonly string[]
  /**
   * 一覧をこの項目（select のもの）の値ごとにまとめ、見出しを付けて並べる（選択肢の順。値が 1 種類なら見出しなし）
   */
  groupKey?: string
  /**
   * 一覧のサムネイルの見せ方。cover は正方形いっぱいに（はみ出したところは切る）、
   * contain は写真全体を見せる（箱を斜めから撮った写真など、縦長で切られると困るもの）
   */
  imageFit?: 'cover' | 'contain'
  /** 一覧に「写真」の表示（名前を小さくして写真を多く並べる）を出す */
  galleryView?: boolean
  /**
   * 一覧のカードの写真に状態の印を付ける値（accent は目立たせる、dim はカードを薄く出す）。
   * ふつうの状態（取得済み・使用中など）には付けない
   */
  marks?: {
    key: string
    values: Readonly<Record<string, 'accent' | 'dim'>>
  }
  fields: readonly AttributeField[]
}

export const collections = {
  instrument: {
    kind: 'instrument',
    path: '/instruments',
    detailPath: '/instruments/$slug',
    label: '楽器',
    acquiredAtLabel: '入手日',
    subtitleKeys: ['maker', 'model'],
    filterKeys: ['category', 'status', 'maker'],
    groupKey: 'status',
    marks: { key: 'status', values: { gone: 'dim' } },
    fields: [
      {
        key: 'category',
        label: '種類',
        type: 'text',
        placeholder: 'エレキギター',
      },
      { key: 'maker', label: 'メーカー', type: 'text' },
      { key: 'model', label: 'モデル', type: 'text' },
      { key: 'year', label: '製造年', type: 'text', placeholder: '2020' },
      // 盗まれたときの照合などに使う番号なので、公開しない
      {
        key: 'serialNumber',
        label: '製造番号',
        type: 'text',
        adminOnly: true,
      },
      {
        key: 'status',
        label: '状態',
        type: 'select',
        options: [
          { value: 'using', label: '使用中' },
          { value: 'stored', label: '保管中' },
          { value: 'gone', label: '手放した' },
        ],
      },
    ],
  },
  certification: {
    kind: 'certification',
    path: '/certifications',
    detailPath: '/certifications/$slug',
    label: '資格',
    acquiredAtLabel: '取得日',
    subtitleKeys: ['issuer'],
    filterKeys: ['status', 'category', 'issuer'],
    groupKey: 'status',
    marks: { key: 'status', values: { studying: 'accent', planned: 'dim' } },
    fields: [
      {
        key: 'status',
        label: '状態',
        type: 'select',
        options: [
          { value: 'acquired', label: '取得済み' },
          { value: 'studying', label: '学習中' },
          { value: 'planned', label: '未取得' },
        ],
      },
      { key: 'issuer', label: '発行元', type: 'text' },
      { key: 'category', label: '分類', type: 'text' },
      { key: 'score', label: 'スコア', type: 'text' },
      { key: 'credentialId', label: '認定番号', type: 'text' },
      { key: 'expiresAt', label: '有効期限', type: 'date' },
      { key: 'verifyUrl', label: '証明ページの URL', type: 'url' },
    ],
  },
  toy: {
    kind: 'toy',
    path: '/toys',
    detailPath: '/toys/$slug',
    label: 'おもちゃ',
    acquiredAtLabel: '入手日',
    subtitleKeys: ['series', 'maker'],
    filterKeys: ['category', 'series', 'maker'],
    imageFit: 'contain',
    galleryView: true,
    fields: [
      {
        key: 'category',
        label: '種類',
        type: 'select',
        options: [
          { value: 'figure', label: 'フィギュア' },
          { value: 'plush', label: 'ぬいぐるみ' },
          { value: 'strap', label: 'ストラップ・キーホルダー' },
          { value: 'model', label: 'プラモデル' },
          { value: 'other', label: 'その他' },
        ],
      },
      {
        key: 'series',
        label: '作品・シリーズ',
        type: 'text',
        placeholder: 'ちいかわ',
      },
      { key: 'maker', label: 'メーカー', type: 'text' },
      {
        key: 'releaseYear',
        label: '発売年',
        type: 'text',
        placeholder: '1998',
      },
      { key: 'officialUrl', label: '公式の商品ページ', type: 'url' },
    ],
  },
  book: {
    kind: 'book',
    path: '/books',
    detailPath: '/books/$slug',
    label: '本',
    acquiredAtLabel: '入手日',
    subtitleKeys: ['author'],
    filterKeys: ['readingStatus', 'category', 'publisher'],
    groupKey: 'readingStatus',
    galleryView: true,
    marks: { key: 'readingStatus', values: { reading: 'accent' } },
    fields: [
      { key: 'author', label: '著者', type: 'text' },
      { key: 'publisher', label: '出版社', type: 'text' },
      { key: 'isbn', label: 'ISBN', type: 'text' },
      { key: 'publishedDate', label: '発行日', type: 'date' },
      { key: 'category', label: '分類', type: 'text' },
      { key: 'format', label: '形式', type: 'text', placeholder: '紙・電子' },
      {
        key: 'readingStatus',
        label: '読書状況',
        type: 'select',
        options: [
          { value: 'unread', label: '積読' },
          { value: 'reading', label: '読書中' },
          { value: 'read', label: '読了' },
        ],
      },
    ],
  },
} as const satisfies Record<CollectionKind, CollectionConfig>

export const collectionList = Object.values(collections)

export type CollectionAttributes = Record<string, string>

/** 項目の値を表示用の文字列にする（select はラベルに変換） */
export function displayAttribute(field: AttributeField, value: string) {
  if (field.type === 'select') {
    return field.options.find((o) => o.value === value)?.label ?? value
  }
  return value
}

/** カードに出す「メーカー / モデル」のような副題 */
export function itemSubtitle(
  kind: CollectionKind,
  attributes: CollectionAttributes,
) {
  return collections[kind].subtitleKeys
    .map((key) => attributes[key])
    .filter(Boolean)
    .join(' / ')
}

/** 一覧の上に絞り込みの札を出す項目 */
export const filterKeysOf = (kind: CollectionKind): readonly string[] =>
  (collections[kind] as { filterKeys?: readonly string[] }).filterKeys ?? []

/** 一覧で絞り込める項目（札を出す項目と、カードの名前の下に出して押せる項目） */
export const facetKeysOf = (kind: CollectionKind): readonly string[] => [
  ...new Set([...filterKeysOf(kind), ...collections[kind].subtitleKeys]),
]

/** カードに付ける状態の印（marks に決めた値のときだけ） */
export function statusMarkOf(
  kind: CollectionKind,
  attributes: CollectionAttributes,
) {
  const marks = (collections[kind] as Pick<CollectionConfig, 'marks'>).marks
  const value = marks && attributes[marks.key]
  const tone = value ? marks.values[value] : undefined
  if (!marks || !value || !tone) return null
  const fields: readonly AttributeField[] = collections[kind].fields
  const field = fields.find((f) => f.key === marks.key)
  return { tone, label: field ? displayAttribute(field, value) : value }
}

/** 一覧をまとめて見出しを付ける項目 */
export const groupFieldOf = (kind: CollectionKind) => {
  const key = (collections[kind] as { groupKey?: string }).groupKey
  const fields: readonly AttributeField[] = collections[kind].fields
  return fields.find((f) => f.key === key)
}

/** 公開側に送る項目だけを残す（管理画面だけで使う項目 adminOnly を除く） */
export function publicAttributes<T extends Record<string, unknown>>(
  kind: CollectionKind,
  attributes: T,
): T {
  const hidden = (collections[kind].fields as readonly AttributeField[])
    .filter((f) => f.type === 'text' && f.adminOnly)
    .map((f) => f.key)
  if (hidden.length === 0) return attributes
  return Object.fromEntries(
    Object.entries(attributes).filter(([key]) => !hidden.includes(key)),
  ) as T
}
