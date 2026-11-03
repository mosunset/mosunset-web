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

/** 2026/11/03 15:30 */
export function formatDateTime(date: Date) {
  return dateTimeFormat.format(date)
}
