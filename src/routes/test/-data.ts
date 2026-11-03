// テスト用のダミーデータ（ファイル名が - で始まるのでルートにはならない）
export type TestItem = { id: string; name: string; description: string }

export const testItems: TestItem[] = [
  { id: '1', name: 'りんご', description: '赤くて甘い果物です。' },
  { id: '2', name: 'みかん', description: '冬によく食べる柑橘類です。' },
  { id: '3', name: 'ぶどう', description: '房になって実る果物です。' },
]

export function findTestItem(id: string) {
  return testItems.find((item) => item.id === id)
}
