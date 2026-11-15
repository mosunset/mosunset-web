import type { ToolUsage } from '@/components/playground/usage-panel'

/** ツールのページの「使い方」（タイトルの右のボタンで出す） */
export const usage: ToolUsage = {
  steps: [
    '最初は見本の写真で、石積み（Masonry）状の並び方が表示されます。',
    '「並べ方」で「左から順（JS）」か「上から順（CSS columns）」を選びます。',
    '「列の数」と「すき間」のスライダーで、レイアウトを調整します。',
    '自分の写真で確かめたいときは「自分の写真で試す」から画像を選び、元に戻すときは「見本に戻す」を押します。',
  ],
  tips: ['写真はブラウザの中だけで表示し、送信しません。'],
}
