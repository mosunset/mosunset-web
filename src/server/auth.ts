import { auth } from '@clerk/tanstack-react-start/server'

import type { Access } from '@/lib/visibility'

/**
 * 役割は Clerk のユーザーの public metadata に入れる（サイト側にはユーザー ID を持たない）。
 * - 管理者: {"role": "admin"}
 * - 限定公開を見られる人: {"role": "viewer"}
 * - それ以外（何もない・ほかの値）: ログインしていても、ふつうの訪問者と同じ
 *
 * public metadata は本人がブラウザから書き換えられない（書けるのはダッシュボードとサーバーだけ）。
 * Clerk のダッシュボードの Sessions →「Customize session token」に
 * {"metadata": "{{user.public_metadata}}"} を入れてあり、ログイン中のトークン（sessionClaims）から
 * API を呼ばずに読める。役割を変えても、トークンが新しくなるまで（1 分ほど）は前の役割のまま
 */
export type Role = 'admin' | 'viewer'

/** トークンの metadata から役割を読む（決まった値以外は役割なし） */
export function roleOf(metadata: unknown): Role | null {
  if (!metadata || typeof metadata !== 'object') return null
  const role = (metadata as { role?: unknown }).role
  return role === 'admin' || role === 'viewer' ? role : null
}

export type AdminStatus =
  | { status: 'signed-out' }
  | { status: 'forbidden'; userId: string; role: Role | null }
  | { status: 'admin'; userId: string }

/** 今のリクエストのユーザーが管理者かどうかを調べる */
export async function resolveAdminStatus(): Promise<AdminStatus> {
  const { isAuthenticated, userId, sessionClaims } = await auth()
  if (!isAuthenticated || !userId) return { status: 'signed-out' }
  const role = roleOf(sessionClaims?.metadata)
  if (role !== 'admin') return { status: 'forbidden', userId, role }
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
  if (state.status === 'forbidden' && state.role === 'viewer') return 'viewer'
  return 'public'
}
