import type { Segment } from './types'

/** 秒を 00:01:02.345 の形にする（SRT は小数点の代わりにカンマ） */
export function formatTime(seconds: number, separator: '.' | ',' = '.') {
  const ms = Math.max(0, Math.round(seconds * 1000))
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  const s = Math.floor((ms % 60_000) / 1000)
  const pad = (n: number, w = 2) => String(n).padStart(w, '0')
  return `${pad(h)}:${pad(m)}:${pad(s)}${separator}${pad(ms % 1000, 3)}`
}

/** 画面に出す短い形（1:02 や 1:02:03） */
export function formatClock(seconds: number) {
  const t = Math.max(0, Math.floor(seconds))
  const h = Math.floor(t / 3600)
  const m = Math.floor((t % 3600) / 60)
  const s = String(t % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`
}

/** 終わりが分からない区切りは、次の区切りの始まりか音声の長さで埋める */
function closed(segments: Segment[], duration: number) {
  return segments
    .map((s, i) => ({
      start: s.start,
      end: s.end ?? segments[i + 1]?.start ?? Math.max(duration, s.start),
      text: s.text.trim(),
    }))
    .filter((s) => s.text)
}

export function toPlainText(segments: Segment[]) {
  return segments
    .map((s) => s.text.trim())
    .filter(Boolean)
    .join('\n')
}

export function toSrt(segments: Segment[], duration: number) {
  return closed(segments, duration)
    .map(
      (s, i) =>
        `${i + 1}\n${formatTime(s.start, ',')} --> ${formatTime(s.end, ',')}\n${s.text}\n`,
    )
    .join('\n')
}

export function toVtt(segments: Segment[], duration: number) {
  const cues = closed(segments, duration)
    .map((s) => `${formatTime(s.start)} --> ${formatTime(s.end)}\n${s.text}\n`)
    .join('\n')
  return `WEBVTT\n\n${cues}`
}
