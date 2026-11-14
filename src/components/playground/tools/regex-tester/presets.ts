/** よく使うパターンの例 */
export type Preset = {
  label: string
  source: string
  flags: string
  text: string
  replacement: string
  /** 例の補足（ボタンの下に出す） */
  note?: string
}

export const presets: readonly Preset[] = [
  {
    label: 'メールアドレス',
    source: String.raw`(?<user>[\w.+-]+)@(?<domain>[\w-]+(?:\.[\w-]+)+)`,
    flags: 'g',
    text: 'お問い合わせは info@example.com まで。\n営業: sales.team+jp@mail.example.co.jp\n間違い: foo@bar / @example.com',
    replacement: '$<user>@***',
    note: '実用向けのかんたんな形です。RFC のすべての書き方には対応しません。',
  },
  {
    label: 'URL',
    source: String.raw`https?:\/\/(?<host>[\w.-]+)(?<path>\/[^\s]*)?`,
    flags: 'g',
    text: '公式サイト https://example.com/ と\nドキュメント http://docs.example.org/guide?lang=ja#intro を見てください。',
    replacement: '[$<host>]',
  },
  {
    label: '郵便番号',
    source: String.raw`〒?(\d{3})-?(\d{4})`,
    flags: 'g',
    text: '〒100-0001 東京都千代田区千代田1-1\n1500002 東京都渋谷区渋谷',
    replacement: '〒$1-$2',
  },
  {
    label: '電話番号',
    source: String.raw`0\d{1,4}-\d{1,4}-\d{3,4}`,
    flags: 'g',
    text: '代表: 03-1234-5678\n携帯: 090-1234-5678\nフリーダイヤル: 0120-123-456',
    replacement: '***-****-****',
  },
  {
    label: '日付',
    source: String.raw`(?<year>\d{4})[-/](?<month>\d{1,2})[-/](?<day>\d{1,2})`,
    flags: 'g',
    text: '公開日: 2026-11-14\n更新日: 2026/1/5',
    replacement: '$<year>年$<month>月$<day>日',
  },
  {
    label: '漢字（\\p{Script=Han}）',
    source: String.raw`\p{Script=Han}+`,
    flags: 'gu',
    text: '吾輩は猫である。名前はまだ無い。どこで生れたかとんと見当がつかぬ。',
    replacement: '【$&】',
    note: '\\p{…} は u か v のフラグが要ります。',
  },
  {
    label: 'カタカナ',
    source: String.raw`[\p{Script=Katakana}ー]+`,
    flags: 'gu',
    text: 'コーヒーとチョコレートケーキを注文した。',
    replacement: '<$&>',
  },
  {
    label: '行頭の空白',
    source: String.raw`^[ \t　]+`,
    flags: 'gm',
    text: '  1 行目\n\t2 行目\n　3 行目（全角スペース）\n4 行目',
    replacement: '',
    note: 'm フラグで、^ が各行の先頭になります。',
  },
  {
    label: '重いパターン',
    source: '^(a+)+$',
    flags: '',
    text: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaab',
    replacement: '',
    note: '破滅的バックトラックの例です。時間切れで止まります。',
  },
]
