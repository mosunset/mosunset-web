const dateFormat = new Intl.DateTimeFormat('ja-JP', {
  dateStyle: 'long',
  timeZone: 'Asia/Tokyo',
})
const dateTimeFormat = new Intl.DateTimeFormat('ja-JP', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Tokyo',
})

/** 2026年11月3日 */
export function formatDate(date: Date) {
  return dateFormat.format(date)
}

/** "2026-11-03"（日本時間の日付）を「2026年11月3日」にする */
export function formatDay(value: string) {
  return formatDate(new Date(`${value}T00:00:00+09:00`))
}

/** 2026/11/03 15:30 */
export function formatDateTime(date: Date) {
  return dateTimeFormat.format(date)
}

/** 管理画面で出すお問い合わせの見出し（件名が空のとき用の文言を入れる） */
export function messageTitle(subject: string) {
  return subject || '（件名なし）'
}

/** 入手・公開から何日までを「新着」とするか */
const RECENT_DAYS = 30

/** 新着か（"2026-11-03" のような日付だけのものは日本時間の日付として読む。先の日付も新着とする） */
export function isRecent(value: string | Date | null | undefined) {
  if (!value) return false
  const date =
    typeof value === 'string'
      ? new Date(
          /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00+09:00` : value,
        )
      : value
  return Date.now() - date.getTime() < RECENT_DAYS * 24 * 60 * 60 * 1000
}

const yearFormat = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  timeZone: 'Asia/Tokyo',
})

/** 日本時間の年（"2026"） */
export function yearOf(date: Date) {
  return yearFormat.format(date)
}
