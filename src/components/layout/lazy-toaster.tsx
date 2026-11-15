import { ClientOnly } from '@tanstack/react-router'
import * as React from 'react'

/**
 * 通知（sonner）の置き場所。通知は何かを押したあとにしか出ないので、ページの表示には要らない。
 * ブラウザで画面を引き継いだあとに読み込み、最初に読む JS を軽くする
 * （toast() を呼ぶ側は sonner を直接 import している。同じ sonner なので、読み込まれれば同じ通知が出る）
 */
const Toaster = React.lazy(() =>
  import('@/components/ui/sonner').then((m) => ({ default: m.Toaster })),
)

export function LazyToaster(props: React.ComponentProps<typeof Toaster>) {
  return (
    <ClientOnly>
      <React.Suspense fallback={null}>
        <Toaster {...props} />
      </React.Suspense>
    </ClientOnly>
  )
}
