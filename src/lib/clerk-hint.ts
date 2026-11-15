import { createIsomorphicFn } from '@tanstack/react-start'
import { getCookies } from '@tanstack/react-start/server'

/**
 * このブラウザでログインしているらしいか（Clerk のプログラムを読み込むかどうかの判断に使う）。
 * Clerk はログインしたことのあるブラウザに __client_uat（名前の後ろに印が付くこともある）を置き、
 * ログイン中は 0 以外、ログアウトすると 0 にする。本当にログインしているかは Clerk とサーバーが確かめる
 */
function signedInFrom(cookies: Iterable<[string, string]>) {
  for (const [name, value] of cookies) {
    if (name.startsWith('__client_uat') && value !== '' && value !== '0') {
      return true
    }
  }
  return false
}

/** 最初の表示はサーバーで、ページを移ったときはブラウザで cookie を読む */
export const readSignedInHint = createIsomorphicFn()
  .server(() => signedInFrom(Object.entries(getCookies())))
  .client(() =>
    signedInFrom(
      document.cookie.split('; ').map((c): [string, string] => {
        const i = c.indexOf('=')
        return [c.slice(0, i), c.slice(i + 1)]
      }),
    ),
  )
