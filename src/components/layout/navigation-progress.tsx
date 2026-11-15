import { useRouterState } from '@tanstack/react-router'
import * as React from 'react'

import { cn } from '@/lib/utils'

/**
 * ページを移るとき、読み込みに時間がかかっていたら画面の上の端に細い線を流す。
 * すぐ終わる移動では出さない（ちらつかないように少し待ってから出す）
 */
export function NavigationProgress() {
  const pending = useRouterState({ select: (s) => s.status === 'pending' })
  const [visible, setVisible] = React.useState(false)

  React.useEffect(() => {
    if (!pending) {
      setVisible(false)
      return
    }
    const timer = setTimeout(() => setVisible(true), 150)
    return () => clearTimeout(timer)
  }, [pending])

  return (
    <div
      aria-hidden="true"
      className={cn(
        'pointer-events-none fixed inset-x-0 top-0 z-60 h-0.5 overflow-hidden transition-opacity duration-300',
        visible ? 'opacity-100' : 'opacity-0',
      )}
    >
      <div className="h-full w-1/3 animate-[nav-progress_1.1s_ease-in-out_infinite] bg-primary motion-reduce:w-full motion-reduce:animate-none motion-reduce:opacity-60" />
    </div>
  )
}
