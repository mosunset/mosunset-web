import * as React from 'react'

import {
  ImageLightbox,
  useImageZoom,
} from '@/components/rich-text/image-viewer'
import { cn } from '@/lib/utils'

/** ボタンの文字を少しのあいだ変えて、押した結果を知らせる */
function flashLabel(button: HTMLElement, label: string) {
  const original = button.dataset.label ?? button.textContent ?? ''
  button.dataset.label = original
  button.textContent = label
  button.dataset.done = ''
  window.clearTimeout(Number(button.dataset.timer))
  button.dataset.timer = String(
    window.setTimeout(() => {
      button.textContent = original
      delete button.dataset.done
    }, 2000),
  )
}

/** コードの塊の「コピー」（サーバーで付けたボタン。src/server/rich-text.ts の withCodeBlockToolbar） */
function copyCodeFrom(target: EventTarget) {
  if (!(target instanceof Element)) return false
  const button = target.closest<HTMLElement>('[data-copy-code]')
  if (!button) return false
  const code =
    button.closest('.code-block')?.querySelector('pre')?.textContent ?? ''
  navigator.clipboard.writeText(code).then(
    () => flashLabel(button, 'コピーしました'),
    () => flashLabel(button, 'コピーできませんでした'),
  )
  return true
}

/**
 * サーバーで作った本文の HTML を表示する。
 * 本文中の画像（リンクになっていないもの）はクリックで拡大表示できる。
 * コードの塊に「コピー」のボタンがあれば、押すと中身をコピーする
 */
export function RichTextContent({
  html,
  className,
}: {
  html: string
  className?: string
}) {
  const zoom = useImageZoom()
  const ref = React.useRef<HTMLDivElement>(null)

  // キーボードでも拡大できるように、本文中の画像にフォーカスが当たるようにする
  // biome-ignore lint/correctness/useExhaustiveDependencies: html が変わったら付け直す
  React.useEffect(() => {
    for (const img of ref.current?.querySelectorAll('img') ?? []) {
      if (img.closest('a')) continue
      // alt="" は「飾りの画像（読み上げない）」の印で、ボタンにはできない。
      // 拡大できる画像として扱うので外し、名前は aria-label で付ける
      if (img.getAttribute('alt') === '') img.removeAttribute('alt')
      img.tabIndex = 0
      img.setAttribute('role', 'button')
      img.setAttribute('aria-label', `${img.alt || '画像'}を拡大して見る`)
    }
    // 横にはみ出すコードは、キーボードでも横に送れるようにフォーカスが当たるようにする
    for (const pre of ref.current?.querySelectorAll('pre') ?? []) {
      if (pre.scrollWidth > pre.clientWidth) pre.tabIndex = 0
    }
  }, [html])

  const openFrom = (target: EventTarget) => {
    if (!(target instanceof HTMLImageElement) || target.closest('a')) {
      return false
    }
    zoom.open({ src: target.currentSrc || target.src, alt: target.alt }, target)
    return true
  }

  return (
    <>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: 中の画像のクリックをまとめて受け取るだけ。キーボードは onKeyDown で同じ操作ができる */}
      <div
        ref={ref}
        className={cn(
          'prose prose-neutral dark:prose-invert max-w-none [&_img:not(a_img)]:cursor-zoom-in',
          className,
        )}
        onClick={(e) => copyCodeFrom(e.target) || openFrom(e.target)}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && openFrom(e.target)) {
            e.preventDefault()
          }
        }}
        // biome-ignore lint/security/noDangerouslySetInnerHtml: サーバーで Tiptap の JSON から生成し、危険なリンクを取り除いた HTML
        dangerouslySetInnerHTML={{ __html: html }}
      />
      <ImageLightbox image={zoom.image} onClose={zoom.close} />
    </>
  )
}
