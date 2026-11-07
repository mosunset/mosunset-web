import { useEffect, useRef } from 'react'

/** Ctrl+S（Mac は ⌘S）で onSave を呼ぶ。ブラウザの「ページを保存」は止める */
export function useSaveShortcut(onSave: () => void) {
  const ref = useRef(onSave)
  ref.current = onSave

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        (e.ctrlKey || e.metaKey) &&
        !e.shiftKey &&
        e.key.toLowerCase() === 's'
      ) {
        e.preventDefault()
        ref.current()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}
