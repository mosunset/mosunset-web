import { XIcon } from 'lucide-react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import * as React from 'react'
import { flushSync } from 'react-dom'

import {
  Dialog,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

export type ViewerImage = { src: string; alt: string }

/** 拡大表示の画像の、View Transitions の名前（src/styles.css の「拡大表示の動き」） */
const ZOOM_NAME = 'zoom-image'

function canAnimate() {
  return (
    typeof document !== 'undefined' &&
    typeof document.startViewTransition === 'function' &&
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

function setZoomName(el: HTMLElement | null | undefined, on: boolean) {
  if (!el) return
  if (on) el.style.setProperty('view-transition-name', ZOOM_NAME)
  else el.style.removeProperty('view-transition-name')
}

/**
 * 拡大表示を開く・閉じるときに、クリックした画像が画面いっぱいまで伸びる（閉じるときは縮んで戻る）。
 * from は前の画面で名前を付けるもの、to は次の画面で名前を付けるもの。
 * 拡大表示の中の画像には、いつも名前が付いている（ImageLightbox）
 */
function zoomTransition(
  update: () => void,
  { from, to }: { from?: HTMLElement | null; to?: HTMLElement | null },
) {
  if (!canAnimate()) {
    update()
    return
  }
  setZoomName(from, true)
  // 拡大表示のあいだは、ほかの名前付きのもの（詳細の写真の枠・ヘッダー）を動きから外す（暗い背景より手前に出ないように。src/styles.css）
  const root = document.documentElement
  root.dataset.zooming = ''
  const run = () => {
    setZoomName(from, false)
    flushSync(update)
    setZoomName(to, true)
  }
  // ページを移るときの動き（types: page）と見分けるため、types: zoom を付ける（使えないブラウザでは付けない）
  const transition = CSS.supports('selector(:active-view-transition-type(a))')
    ? document.startViewTransition({ update: run, types: ['zoom'] })
    : document.startViewTransition(run)
  transition.finished.finally(() => {
    setZoomName(to, false)
    delete root.dataset.zooming
  })
}

/** 大きい画像を先に読んでおく（読み込む前に動くと、伸びた先が空になるため）。待つのは少しだけ */
function preload(src: string) {
  const img = new Image()
  img.src = src
  return Promise.race([
    img.decode().catch(() => undefined),
    new Promise((resolve) => setTimeout(resolve, 300)),
  ])
}

/**
 * 拡大表示を開く・閉じる。open にはクリックした画像（伸び始める元）を渡す。
 * 待っているあいだ（大きい画像の読み込み）も、ページはふつうに操作できる
 */
export function useImageZoom() {
  const [state, setState] = React.useState<{
    image: ViewerImage
    source: HTMLElement | null
  } | null>(null)
  const sourceRef = React.useRef<HTMLElement | null>(null)

  const open = React.useCallback(
    async (image: ViewerImage, source: HTMLElement | null) => {
      sourceRef.current = source
      if (canAnimate()) await preload(image.src)
      zoomTransition(() => setState({ image, source }), { from: source })
    },
    [],
  )
  const close = React.useCallback(() => {
    zoomTransition(() => setState(null), { to: sourceRef.current })
  }, [])

  return { image: state?.image ?? null, open, close }
}

/** 画像を画面いっぱいに、切らずに全体を表示する */
export function ImageLightbox({
  image,
  onClose,
}: {
  image: ViewerImage | null
  onClose: () => void
}) {
  return (
    <Dialog open={!!image} onOpenChange={(open) => !open && onClose()}>
      <DialogPortal>
        <DialogOverlay className="bg-black/85 supports-backdrop-filter:backdrop-blur-none" />
        <DialogPrimitive.Content
          className="fixed inset-0 z-50 flex items-center justify-center p-4 outline-none sm:p-8"
          // 画像の外側をクリックしたら閉じる
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose()
          }}
          aria-describedby={undefined}
        >
          <DialogTitle className="sr-only">
            {image?.alt || '画像の拡大表示'}
          </DialogTitle>
          {image && (
            <img
              src={image.src}
              alt={image.alt}
              // 開く・閉じるときに、クリックした画像とつなぐ（zoomTransition）
              style={{ viewTransitionName: ZOOM_NAME }}
              className="max-h-full max-w-full rounded-md object-contain shadow-2xl"
            />
          )}
          <DialogPrimitive.Close className="absolute top-3 right-3 rounded-full bg-black/60 p-2 text-white transition-colors hover:bg-black/80 focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none">
            <XIcon className="size-5" />
            <span className="sr-only">閉じる</span>
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  )
}

/** クリックすると拡大表示できる画像 */
export function ZoomableImage({
  src,
  alt,
  className,
  imgClassName,
  frameProps,
  ...imgProps
}: {
  src: string
  alt: string
  className?: string
  imgClassName?: string
  /** 枠（ボタン）に付ける属性。ページを移るときの動きの名前など（src/lib/view-transition.ts） */
  frameProps?: React.HTMLAttributes<HTMLElement>
} & Omit<React.ComponentProps<'img'>, 'src' | 'alt' | 'className'>) {
  const zoom = useImageZoom()
  const imgRef = React.useRef<HTMLImageElement>(null)
  return (
    <>
      <button
        {...frameProps}
        type="button"
        onClick={() => zoom.open({ src, alt }, imgRef.current)}
        className={cn(
          'block w-full cursor-zoom-in overflow-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
          className,
        )}
        aria-label={alt ? `${alt}を拡大して見る` : '画像を拡大して見る'}
      >
        <img
          ref={imgRef}
          src={src}
          alt={alt}
          className={imgClassName}
          {...imgProps}
        />
      </button>
      <ImageLightbox image={zoom.image} onClose={zoom.close} />
    </>
  )
}
