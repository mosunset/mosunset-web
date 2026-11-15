import { createIsomorphicFn } from '@tanstack/react-start'
import { getCookie } from '@tanstack/react-start/server'

/** 管理画面の左メニューを畳んだかどうかを覚えておく cookie（管理画面の中だけで送る） */
export const adminSidebarCookie = { name: 'admin_sidebar', path: '/admin' }

/**
 * 管理画面の左メニューを開いて出すか（前に畳んだなら畳んだまま）。
 * 最初の表示はサーバーで、ページを移ったときはブラウザで cookie を読む
 */
export const readAdminSidebarOpen = createIsomorphicFn()
  .server(() => getCookie(adminSidebarCookie.name) !== 'false')
  .client(
    () =>
      !document.cookie.split('; ').includes(`${adminSidebarCookie.name}=false`),
  )
