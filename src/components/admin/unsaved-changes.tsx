import { useBlocker } from '@tanstack/react-router'
import { Check, CircleDot, History, Loader2 } from 'lucide-react'
import { useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

/**
 * 保存していない変更があるときに、ページの移動を止めて確認する。
 * タブを閉じる・リロードするときはブラウザの標準の確認を出す。
 */
export function UnsavedChangesGuard({
  dirty,
  onSave,
}: {
  dirty: boolean
  /** 保存に成功したら true を返す */
  onSave: () => Promise<boolean>
}) {
  // 保存直後の移動を止めないよう、常に最新の値を見る
  const dirtyRef = useRef(dirty)
  dirtyRef.current = dirty
  const blocker = useBlocker({
    shouldBlockFn: () => dirtyRef.current,
    enableBeforeUnload: () => dirtyRef.current,
    withResolver: true,
  })
  const [saving, setSaving] = useState(false)

  if (blocker.status !== 'blocked') return null

  return (
    <Dialog open onOpenChange={(open) => !open && blocker.reset()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>保存していない変更があります</DialogTitle>
          <DialogDescription>
            このまま移動すると、変更は失われます（ブラウザ内の控えからは復元できます）。
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={() => blocker.reset()}>
            キャンセル
          </Button>
          <Button variant="outline" onClick={() => blocker.proceed()}>
            保存せずに移動
          </Button>
          <Button
            disabled={saving}
            onClick={async () => {
              setSaving(true)
              const ok = await onSave()
              setSaving(false)
              if (ok) blocker.proceed()
              else blocker.reset()
            }}
          >
            {saving && <Loader2 className="animate-spin" />}
            保存して移動
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** 保存の状態（未保存・保存中・保存済み） */
export function SaveStatus({
  dirty,
  saving,
  savedAt,
  autoSaving,
}: {
  dirty: boolean
  saving: boolean
  savedAt: Date | null
  autoSaving?: boolean
}) {
  if (saving) {
    return (
      <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" />
        {autoSaving ? '自動保存中…' : '保存中…'}
      </span>
    )
  }
  if (dirty) {
    return (
      <span className="inline-flex items-center gap-1 text-sm text-amber-600 dark:text-amber-400">
        <CircleDot className="size-3.5" />
        未保存の変更あり
      </span>
    )
  }
  if (savedAt) {
    return (
      <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
        <Check className="size-3.5" />
        保存済み{' '}
        {savedAt.toLocaleTimeString('ja-JP', {
          hour: '2-digit',
          minute: '2-digit',
        })}
      </span>
    )
  }
  return null
}

/** ブラウザ内に控えが残っているときの案内 */
export function BackupNotice({
  savedAt,
  onRestore,
  onDiscard,
}: {
  savedAt: number
  onRestore: () => void
  onDiscard: () => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
      <History className="size-4 shrink-0" />
      <span className="flex-1">
        {new Date(savedAt).toLocaleString('ja-JP', {
          month: 'numeric',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })}{' '}
        の保存されていない変更が残っています。
      </span>
      <Button size="sm" onClick={onRestore}>
        復元する
      </Button>
      <Button size="sm" variant="ghost" onClick={onDiscard}>
        破棄
      </Button>
    </div>
  )
}
