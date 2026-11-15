import { jaJP } from '@clerk/localizations/ja-JP'
import { ClerkProvider, Show, UserButton } from '@clerk/tanstack-react-start'
import { shadcn } from '@clerk/ui/themes'
import { Link } from '@tanstack/react-router'
import { LayoutDashboard } from 'lucide-react'
import type * as React from 'react'

import { type ClerkUi, ClerkUiProvider } from '@/lib/auth/clerk-ui'

/**
 * Clerk（ログイン）の枠と、Clerk を使う部品。管理画面・ログインの画面・ログイン中のときだけ、
 * あとから読み込む（src/components/auth/clerk-loader.tsx）。訪問者のページの JS には入らない
 */

/** ヘッダーの右に出す「管理」とアカウントのボタン（管理者がログインしているときだけ） */
function HeaderAccount({ linkClassName }: { linkClassName: string }) {
  return (
    <Show when="signed-in">
      <Link to="/admin" aria-label="管理画面" className={linkClassName}>
        <LayoutDashboard className="lg:hidden" />
        <span className="hidden lg:inline">管理</span>
      </Link>
      <UserButton />
    </Show>
  )
}

const ui: ClerkUi = { HeaderAccount }

export default function ClerkRoot({
  nonce,
  children,
}: {
  nonce?: string
  children: React.ReactNode
}) {
  return (
    <ClerkProvider
      nonce={nonce}
      appearance={{ theme: shadcn }}
      signInUrl="/sign-in"
      localization={jaJP}
    >
      <ClerkUiProvider value={ui}>{children}</ClerkUiProvider>
    </ClerkProvider>
  )
}
