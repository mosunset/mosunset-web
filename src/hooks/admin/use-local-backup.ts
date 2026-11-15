import { useCallback, useEffect, useRef, useState } from 'react'

type Backup<T> = { value: T; savedAt: number }

const PREFIX = 'mosunset:backup:'

function read<T>(key: string): Backup<T> | null {
  try {
    const raw = window.localStorage.getItem(PREFIX + key)
    return raw ? (JSON.parse(raw) as Backup<T>) : null
  } catch {
    return null
  }
}

/**
 * 保存していない入力内容をブラウザ（localStorage）に控えておく。
 * ブラウザが落ちたりタブを閉じたりしても、次に開いたときに復元できる。
 *
 * - dirty の間だけ、少し待ってから控えを書き込む
 * - 開いたときに控えがあれば backup として返す（復元するかは画面側で決める）
 */
export function useLocalBackup<T>(key: string, value: T, dirty: boolean) {
  const [backup, setBackup] = useState<Backup<T> | null>(null)
  const checked = useRef(false)

  // 開いたときに一度だけ控えを確認する（SSR では localStorage がないのでブラウザで）
  useEffect(() => {
    if (checked.current) return
    checked.current = true
    setBackup(read<T>(key))
  }, [key])

  useEffect(() => {
    if (!dirty) return
    const timer = window.setTimeout(() => {
      try {
        window.localStorage.setItem(
          PREFIX + key,
          JSON.stringify({ value, savedAt: Date.now() } satisfies Backup<T>),
        )
      } catch {
        // 容量オーバーなどは無視する（控えがないだけで入力はできる）
      }
    }, 800)
    return () => window.clearTimeout(timer)
  }, [key, value, dirty])

  /** 保存できたら控えを消す */
  const clear = useCallback(() => {
    try {
      window.localStorage.removeItem(PREFIX + key)
    } catch {}
    setBackup(null)
  }, [key])

  /** 控えの案内を閉じる（控え自体は次に保存したときに消える） */
  const dismiss = useCallback(() => setBackup(null), [])

  return { backup, clear, dismiss }
}
