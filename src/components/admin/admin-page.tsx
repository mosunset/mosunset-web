import type { ReactNode } from 'react'

/**
 * 管理画面の各ページの外枠と見出し。
 * - action を渡すと、見出しの右にボタンなどを並べる
 * - form のときは見出しの下に余白をとる（入力フォームのページ用）
 */
export function AdminPage({
  title,
  action,
  form = false,
  maxWidth = 'max-w-5xl',
  children,
}: {
  title: ReactNode
  action?: ReactNode
  form?: boolean
  maxWidth?: 'max-w-4xl' | 'max-w-5xl'
  children: ReactNode
}) {
  return (
    <div className={`mx-auto w-full ${maxWidth} px-4 py-6 sm:px-6 sm:py-8`}>
      {action ? (
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-bold sm:text-3xl">{title}</h1>
          {action}
        </div>
      ) : form ? (
        <h1 className="mb-6 text-2xl font-bold sm:mb-8 sm:text-3xl">{title}</h1>
      ) : (
        <h1 className="text-2xl font-bold sm:text-3xl">{title}</h1>
      )}
      {children}
    </div>
  )
}
