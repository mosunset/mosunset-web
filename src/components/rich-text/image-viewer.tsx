import { XIcon } from 'lucide-react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import * as React from 'react'

import {
  Dialog,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

export type ViewerImage = { src: string; alt: string }

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
  ...imgProps
}: {
  src: string
  alt: string
  className?: string
  imgClassName?: string
} & Omit<React.ComponentProps<'img'>, 'src' | 'alt' | 'className'>) {
  const [open, setOpen] = React.useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'block w-full cursor-zoom-in overflow-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
          className,
        )}
        aria-label={alt ? `${alt}を拡大して見る` : '画像を拡大して見る'}
      >
        <img src={src} alt={alt} className={imgClassName} {...imgProps} />
      </button>
      <ImageLightbox
        image={open ? { src, alt } : null}
        onClose={() => setOpen(false)}
      />
    </>
  )
}
