import { useCallback, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { toast } from 'sonner'

import { useLocalBackup } from '@/hooks/use-local-backup'
import { errorMessage } from '@/lib/errors'

type SaveOptions<R> = {
  /** 自動保存など、利用者が押していない保存のとき true */
  silent?: boolean
  /** 保存できたあと（保存済みにして控えを消したあと）の処理。通知や移動 */
  onSaved: (result: R) => Promise<void> | void
  /** 保存に失敗したときの通知。省略するとエラーをそのまま出す */
  onError?: (message: string, snapshot: string) => void
}

type DeleteOptions = {
  /** 確認に出す名前 */
  title: string
  remove: () => Promise<unknown>
  /** 削除できたあと（保存済みにして控えを消したあと）の移動 */
  onDeleted: () => Promise<void> | void
}

/**
 * 記事・コレクションの編集フォームで共通の状態と保存・削除の流れ。
 *
 * - 入力内容と「保存済み」の内容を比べて未保存かどうかを出す
 * - 未保存の内容はブラウザに控えておき、復元できるようにする
 * - 保存・削除できたら、移動の前に保存済みにする（移動の確認を出さないため）
 */
export function useEditableForm<F extends object>({
  initial,
  backupKey,
  savedAt: initialSavedAt,
}: {
  initial: F
  /** ブラウザ内の控えの名前 */
  backupKey: string
  /** 最後に保存した日時。新規作成時は null */
  savedAt: Date | null
}) {
  const [fields, setFields] = useState<F>(initial)
  const [savedSnapshot, setSavedSnapshot] = useState(() =>
    JSON.stringify(initial),
  )
  const [editorKey, setEditorKey] = useState(0)
  const [saving, setSaving] = useState(false)
  const [autoSaving, setAutoSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<Date | null>(initialSavedAt)
  const [error, setError] = useState<string | null>(null)

  const dirty = JSON.stringify(fields) !== savedSnapshot
  const {
    backup,
    clear: clearBackup,
    dismiss: dismissBackup,
  } = useLocalBackup(backupKey, fields, dirty)

  const set = <K extends keyof F>(key: K, value: F[K]) =>
    setFields((prev) => ({ ...prev, [key]: value }))

  // 保存中に重ねて保存しないための印
  const savingRef = useRef(false)

  /** 今の入力内容を送って保存する。保存できたら true */
  const runSave = useCallback(
    async <R>(
      send: (fields: F) => Promise<R>,
      { silent = false, onSaved, onError }: SaveOptions<R>,
    ): Promise<boolean> => {
      if (savingRef.current) return false
      savingRef.current = true
      setSaving(true)
      setAutoSaving(silent)
      setError(null)
      // 保存中に入力が続いても、送った時点の内容を「保存済み」とする
      const snapshot = JSON.stringify(fields)
      try {
        const result = await send(fields)
        flushSync(() => {
          setSavedSnapshot(snapshot)
          setSavedAt(new Date())
        })
        clearBackup()
        await onSaved(result)
        return true
      } catch (e) {
        const message = errorMessage(e)
        setError(message)
        if (onError) onError(message, snapshot)
        else toast.error(message)
        return false
      } finally {
        savingRef.current = false
        setSaving(false)
        setAutoSaving(false)
      }
    },
    [fields, clearBackup],
  )

  /** 確認してから削除する */
  const runDelete = async ({ title, remove, onDeleted }: DeleteOptions) => {
    if (!window.confirm(`「${title}」を削除します。元に戻せません。`)) {
      return
    }
    setSaving(true)
    try {
      await remove()
      flushSync(() => setSavedSnapshot(JSON.stringify(fields)))
      clearBackup()
      toast.success('削除しました')
      await onDeleted()
    } catch (e) {
      toast.error(errorMessage(e, '削除できませんでした'))
      setSaving(false)
    }
  }

  // 控えが今の入力と同じなら、復元の案内は出さない
  const pendingBackup =
    backup && JSON.stringify(backup.value) !== JSON.stringify(fields)
      ? backup
      : null

  /** <FormRecovery> に渡す値 */
  const recovery = {
    dirty,
    backupSavedAt: pendingBackup?.savedAt ?? null,
    onRestore: () => {
      if (!pendingBackup) return
      setFields(pendingBackup.value)
      setEditorKey((k) => k + 1)
      dismissBackup()
    },
    onDiscard: clearBackup,
  }

  return {
    fields,
    setFields,
    set,
    dirty,
    editorKey,
    saving,
    autoSaving,
    savedAt,
    error,
    runSave,
    runDelete,
    recovery,
  }
}
