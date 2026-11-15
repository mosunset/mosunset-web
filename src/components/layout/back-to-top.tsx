import { ArrowUp } from 'lucide-react'
import * as React from 'react'

import { cn } from '@/lib/utils'

/** 長いページで、下のほうまで読んだときに出る「先頭へ戻る」ボタン */
export function BackToTop() {
  const [show, setShow] = React.useState(false)

  React.useEffect(() => {
    const update = () => setShow(window.scrollY > window.innerHeight * 1.5)
    update()
    window.addEventListener('scroll', update, { passive: true })
    return () => window.removeEventListener('scroll', update)
  }, [])

  return (
    <button
      type="button"
      onClick={() => {
        const reduce = window.matchMedia(
          '(prefers-reduced-motion: reduce)',
        ).matches
        window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' })
        // ボタンは消えるので、キーボードの位置は本文の先頭へ移す
        document.getElementById('content')?.focus({ preventScroll: true })
      }}
      aria-label="ページの先頭へ戻る"
      aria-hidden={!show}
      tabIndex={show ? 0 : -1}
      className={cn(
        'fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 flex size-11 items-center justify-center rounded-full border bg-background/90 text-muted-foreground shadow-md backdrop-blur transition-[opacity,translate] duration-200 hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
        show ? 'opacity-100' : 'pointer-events-none translate-y-2 opacity-0',
      )}
    >
      <ArrowUp className="size-5" />
    </button>
  )
}
