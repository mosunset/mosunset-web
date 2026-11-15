// DB のスキーマ（src/server/db/schema.ts）と画面の両方で使うので、ほかのファイルに頼らない形でここに置く

/** コレクションの種類 */
export const collectionKinds = [
  'instrument',
  'certification',
  'toy',
  'book',
] as const
export type CollectionKind = (typeof collectionKinds)[number]

export function isCollectionKind(value: string): value is CollectionKind {
  return (collectionKinds as readonly string[]).includes(value)
}
