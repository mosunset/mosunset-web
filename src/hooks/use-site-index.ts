import { useEffect, useState } from 'react'

import { getSiteIndex, type SiteIndex } from '@/functions/search'

/** 取ってきた一覧を使い回す時間。記事やコレクションを足したら、少しあとで出るようになる */
const MAX_AGE_MS = 5 * 60 * 1000

let cache: { at: number; promise: Promise<SiteIndex> } | null = null

function loadSiteIndex() {
  if (!cache || Date.now() - cache.at > MAX_AGE_MS) {
    const promise = getSiteIndex().catch((error: unknown) => {
      // 失敗したものは覚えておかない（次に開いたときにもう一度取りに行く）
      cache = null
      throw error
    })
    cache = { at: Date.now(), promise }
  }
  return cache.promise
}

/**
 * 記事とコレクションの一覧（サイト全体の検索・サイドバー用）。
 * enabled になったときに初めて取りに行き、取ったものはページを移っても使い回す
 */
export function useSiteIndex(enabled: boolean) {
  const [index, setIndex] = useState<SiteIndex | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!enabled) return
    let alive = true
    setFailed(false)
    loadSiteIndex().then(
      (value) => alive && setIndex(value),
      () => alive && setFailed(true),
    )
    return () => {
      alive = false
    }
  }, [enabled])

  return { index, failed }
}
