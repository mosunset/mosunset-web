import { auth } from '@clerk/tanstack-react-start/server'
import { createMiddleware, createServerFn } from '@tanstack/react-start'

/** 管理者として扱う Clerk のユーザー ID（.dev.vars / Cloudflare の環境変数 ADMIN_USER_IDS にカンマ区切りで書く） */
export function getAdminUserIds() {
  return (process.env.ADMIN_USER_IDS ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)
}

type AdminStatus =
  | { status: 'signed-out' }
  | { status: 'forbidden'; userId: string }
  | { status: 'admin'; userId: string }

async function resolveAdminStatus(): Promise<AdminStatus> {
  const { isAuthenticated, userId } = await auth()
  if (!isAuthenticated || !userId) return { status: 'signed-out' }
  if (!getAdminUserIds().includes(userId))
    return { status: 'forbidden', userId }
  return { status: 'admin', userId }
}

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
