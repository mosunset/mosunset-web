import { auth } from '@clerk/tanstack-react-start/server'

import type { Access } from '@/lib/visibility'

/** 環境変数のカンマ区切りの Clerk のユーザー ID */
function userIdsOf(value: string | undefined) {
  return (value ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)
}

/** 管理者として扱う Clerk のユーザー ID（.dev.vars / Cloudflare の環境変数 ADMIN_USER_IDS にカンマ区切りで書く） */
export function getAdminUserIds() {
  return userIdsOf(process.env.ADMIN_USER_IDS)
}

/**
 * 限定公開のものを見られる Clerk のユーザー ID（.dev.vars / Cloudflare の秘密の値 VIEWER_USER_IDS にカンマ区切りで書く）。
 * 管理者はここに書かなくても見られる。Clerk に誰でも登録できても、ここに書いた人にしか見せない
 */
export function getViewerUserIds() {
  return userIdsOf(process.env.VIEWER_USER_IDS)
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

/** 今のリクエストが管理者のログイン中か */
export async function isAdminRequest() {
  return (await resolveAdminStatus()).status === 'admin'
}

/** 今のリクエストの人が、どこまで見られるか（src/lib/visibility.ts） */
export async function resolveAccess(): Promise<Access> {
  const state = await resolveAdminStatus()
  if (state.status === 'admin') return 'admin'
  if (
    state.status === 'forbidden' &&
    getViewerUserIds().includes(state.userId)
  ) {
    return 'viewer'
  }
  return 'public'
}
