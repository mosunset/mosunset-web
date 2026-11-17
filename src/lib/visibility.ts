/**
 * 記事・コレクション・ツールの公開の状態（2026-11 から 3 つ）。
 *
 * - published（公開）: 誰でも見られる。一覧・サイト内検索・サイトマップ・RSS・llms.txt にも出す
 * - limited（限定公開）: 管理者と、Clerk の役割が viewer の人（src/server/auth.ts）がログインしているときだけ、公開側のページ・一覧・検索に出す。
 *   サイトマップ・RSS・llms.txt には出さず、ページは検索エンジンに載せない（noindex）
 * - draft（未公開）: 管理画面だけ（管理者のログイン中は、確かめられるように公開側のページにも印付きで出す）
 *
 * データベースの値は記事・コレクションとも posts.status / collection_items.status にこの文字で入っている
 */
export const visibilities = ['published', 'limited', 'draft'] as const

export type Visibility = (typeof visibilities)[number]

export const visibilityLabels: Record<Visibility, string> = {
  published: '公開',
  limited: '限定公開',
  draft: '未公開',
}

/**
 * 今見ている人が、どこまで見られるか。
 * - admin: 管理者（Clerk の public metadata が {"role": "admin"}）。すべて
 * - viewer: 限定公開を見られる人（{"role": "viewer"}）。公開と限定公開
 * - public: それ以外（ログインしていない人・ほかの人）。公開だけ
 */
export type Access = 'admin' | 'viewer' | 'public'

/** その人に見せてよい状態 */
export function visibleStatuses(access: Access): readonly Visibility[] {
  if (access === 'admin') return visibilities
  if (access === 'viewer') return ['published', 'limited']
  return ['published']
}

export function canSee(access: Access, visibility: Visibility) {
  return visibleStatuses(access).includes(visibility)
}
