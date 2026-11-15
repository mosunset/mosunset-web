import * as React from 'react'

/**
 * Clerk（ログイン）を読み込んだときにだけ使える部品。
 * ログインしていない訪問者には Clerk のプログラムを読み込ませないので、読み込んでいないときは null
 * （src/components/auth/clerk-root.tsx が渡す。読み込むかどうかは src/routes/__root.tsx が決める）
 */
export type ClerkUi = {
  /** ヘッダーの右の「管理」とアカウントのボタン（管理者がログインしているときだけ出る） */
  HeaderAccount: React.ComponentType<{ linkClassName: string }>
}

const ClerkUiContext = React.createContext<ClerkUi | null>(null)

export const ClerkUiProvider = ClerkUiContext.Provider

export function useClerkUi() {
  return React.useContext(ClerkUiContext)
}
