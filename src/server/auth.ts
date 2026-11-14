import { auth } from '@clerk/tanstack-react-start/server'

/** 管理者として扱う Clerk のユーザー ID（.dev.vars / Cloudflare の環境変数 ADMIN_USER_IDS にカンマ区切りで書く） */
export function getAdminUserIds() {
  return (process.env.ADMIN_USER_IDS ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)
}

export type AdminStatus =
  | { status: 'signed-out' }
  | { status: 'forbidden'; userId: string }
  | { status: 'admin'; userId: string }

/** 今のリクエストのユーザーが管理者かどうかを調べる */
export async function resolveAdminStatus(): Promise<AdminStatus> {
  const { isAuthenticated, userId } = await auth()
  if (!isAuthenticated || !userId) return { status: 'signed-out' }
  if (!getAdminUserIds().includes(userId))
    return { status: 'forbidden', userId }
  return { status: 'admin', userId }
}

/** 今のリクエストが管理者のログイン中か（公開側のページで、管理者にだけ下書きも見せるのに使う） */
export async function isAdminRequest() {
  return (await resolveAdminStatus()).status === 'admin'
}
