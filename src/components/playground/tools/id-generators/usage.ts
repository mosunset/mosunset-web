import type { ToolUsage } from '@/components/playground/usage-panel'

/** ツールのページの「使い方」（タイトルの右のボタンで出す） */
export const usage: ToolUsage = {
  steps: [
    'ページを開くと、UUID v4・UUID v7・ULID・Cuid2・NanoID の ID がそれぞれ自動で作られます。',
    '「生成する数」で、1 種類あたりいくつ作るかを選びます。',
    'それぞれの説明を読んで、用途に合った形式を選びます。',
    '「コピー」（複数個のときは「すべてコピー」）を押して ID をコピーします。',
    '別の ID がほしいときは「すべて作り直す」を押すか、種類ごとの更新ボタンを押します。',
  ],
  tips: [
    'DB の主キーのように作った順に並べたいときは、UUID v7 か ULID が向いています。',
  ],
}
