import type { ToolUsage } from '@/components/playground/usage-panel'

/** ツールのページの「使い方」（タイトルの右のボタンで出す） */
export const usage: ToolUsage = {
  steps: [
    '「テキスト A」と「テキスト B」に、比べたい 2 つの文章を入力します。',
    '必要に応じて「比べる前の正規化」で「全角・半角をそろえる（NFKC）」「空白を取り除く」などにチェックを入れます。',
    '表で、n ごとの Jaccard 係数と Dice 係数、「共通 / A / B」の数を確認します。',
    '表の行をクリックして n を切り替え、下に強調表示される共通部分を確認します。',
  ],
  tips: [
    '計算式は「計算のしかた」を開くと確認できます。Dice 係数は Jaccard 係数より高めに出ます。',
  ],
}
