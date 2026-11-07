import { createMiddleware, createServerFn } from '@tanstack/react-start'

import { resolveAdminStatus } from '@/server/auth'

/** 今のユーザーが管理者かどうか（/admin の beforeLoad で使う） */
export const getAdminStatus = createServerFn({ method: 'GET' }).handler(() =>
  resolveAdminStatus(),
)

/**
 * 管理者だけが呼べる server function にするためのミドルウェア。
 * 画面側のチェックとは別に、データを書き換える処理では必ずこれを付ける。
 *
 * @example createServerFn({ method: 'POST' }).middleware([adminMiddleware]).handler(...)
 */
export const adminMiddleware = createMiddleware({ type: 'function' }).server(
  async ({ next }) => {
    const state = await resolveAdminStatus()
    if (state.status !== 'admin') {
      throw new Error('管理者としてログインしていません')
    }
    return next({ context: { adminUserId: state.userId } })
  },
)
