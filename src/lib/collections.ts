import type { CollectionKind } from '@/server/db/schema'

export type { CollectionKind }

/** 種類ごとの追加項目の定義。管理画面の入力欄・サーバーの検証・公開ページの表示に使う */
export type AttributeField =
  | { key: string; label: string; type: 'text'; placeholder?: string }
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
    ],
  },
  certification: {
    kind: 'certification',
    path: '/certifications',
    detailPath: '/certifications/$slug',
    label: '資格',
    acquiredAtLabel: '取得日',
    subtitleKeys: ['issuer'],
    fields: [
      { key: 'issuer', label: '発行元', type: 'text' },
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
    subtitleKeys: ['maker', 'series'],
    fields: [
      { key: 'maker', label: 'メーカー', type: 'text' },
      { key: 'series', label: 'シリーズ', type: 'text' },
      {
        key: 'releaseYear',
        label: '発売年',
        type: 'text',
        placeholder: '1998',
      },
    ],
  },
  book: {
    kind: 'book',
    path: '/books',
    detailPath: '/books/$slug',
    label: '本',
    acquiredAtLabel: '入手日',
    subtitleKeys: ['author'],
    fields: [
      { key: 'author', label: '著者', type: 'text' },
      { key: 'publisher', label: '出版社', type: 'text' },
      { key: 'isbn', label: 'ISBN', type: 'text' },
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

export function isCollectionKind(value: string): value is CollectionKind {
  return value in collections
}

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

/** R2 の画像キーから配信用の URL を作る */
export function imageUrl(key: string | null | undefined) {
  return key ? `/images/${key}` : null
}
