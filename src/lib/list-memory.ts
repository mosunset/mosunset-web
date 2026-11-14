import { useSyncExternalStore } from 'react'

import { normalizePath } from '@/lib/seo'

/**
 * 一覧ページの状態を、ブラウザに覚えておく。
 * - 最後に使った絞り込み（タブを閉じるまで）: 詳しいページの「← 一覧へ」やパンくずで、同じ一覧に戻れるように
 *
 * サーバーではブラウザの保存場所を読めないので、最初の描画では「覚えていない」として扱い、
 * 画面が動き出してから覚えている値に切り替わる（useSyncExternalStore のサーバー用の値）
 */

type Area = 'local' | 'session'

/** 同じタブの中で書き換えたことを知らせる（storage イベントは別のタブにしか届かない） */
const CHANGE_EVENT = 'mosunset:list-memory'

function storageOf(area: Area) {
  try {
    return area === 'local' ? window.localStorage : window.sessionStorage
  } catch {
    // 保存を許していないブラウザ（Cookie を切っているなど）
    return null
  }
}

function read(area: Area, key: string) {
  try {
    return storageOf(area)?.getItem(key) ?? null
  } catch {
    return null
  }
}

function write(area: Area, key: string, value: string | null) {
  if (read(area, key) === value) return
  try {
    const storage = storageOf(area)
    if (value === null) storage?.removeItem(key)
    else storage?.setItem(key, value)
  } catch {
    // 容量がいっぱいなど。覚えられなくても一覧は使える
  }
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

function subscribe(onChange: () => void) {
  window.addEventListener('storage', onChange)
  window.addEventListener(CHANGE_EVENT, onChange)
  return () => {
    window.removeEventListener('storage', onChange)
    window.removeEventListener(CHANGE_EVENT, onChange)
  }
}

function useStored(area: Area, key: string) {
  return useSyncExternalStore(
    subscribe,
    () => read(area, key),
    () => null,
  )
}

const searchKey = (path: string) => `list-search:${normalizePath(path)}`

/** 一覧の今の絞り込み（URL の search）を覚える。何も絞っていなければ忘れる */
export function rememberListSearch(path: string, searchJson: string) {
  write('session', searchKey(path), searchJson === '{}' ? null : searchJson)
}

/** その一覧で最後に使った絞り込み（覚えていなければ undefined） */
export function useRememberedListSearch(
  path: string,
): Record<string, unknown> | undefined {
  const json = useStored('session', searchKey(path))
  if (!json) return undefined
  try {
    const value: unknown = JSON.parse(json)
    return value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : undefined
  } catch {
    return undefined
  }
}

/** 一覧の中の 1 件の要素の id（詳しいページから戻ったとき、そこまでスクロールする） */
export const listItemId = (slug: string) => `item-${slug}`
