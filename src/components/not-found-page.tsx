import { Link, type LinkProps } from '@tanstack/react-router'
import type * as React from 'react'

/** 見つからないときのページ。一覧へ戻るリンクは backTo を渡したときだけ出す */
export function NotFoundPage({
  title,
  message,
  backTo,
  backLabel,
  width,
}: {
  title: string
  message: string
  backTo?: LinkProps['to']
  backLabel?: React.ReactNode
  /** ページの最大幅 */
  width: 'max-w-3xl' | 'max-w-5xl'
}) {
  return (
    <div className={`mx-auto w-full ${width} px-6 py-8`}>
      <h1 className="text-3xl font-bold">{title}</h1>
      <p className="mt-4 text-muted-foreground">{message}</p>
      {backTo && (
        <Link to={backTo} className="mt-6 inline-block underline">
          {backLabel}
        </Link>
      )}
    </div>
  )
}
