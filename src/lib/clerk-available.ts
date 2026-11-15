import * as React from 'react'

/**
 * ClerkProvider を置いているか。ログインしていない訪問者には Clerk のプログラムを読み込ませないので、
 * Clerk の部品（Show・UserButton など）は、これが true のときだけ使う（src/routes/__root.tsx）
 */
const ClerkAvailableContext = React.createContext(false)

export const ClerkAvailableProvider = ClerkAvailableContext.Provider

export function useClerkAvailable() {
  return React.useContext(ClerkAvailableContext)
}
