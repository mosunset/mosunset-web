import { useServerFn } from '@tanstack/react-start'
import { Loader2 } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { listImagesWithoutThumbnail } from '@/functions/images'
import { useThumbnailMaker } from '@/hooks/admin/use-image-upload'
import { errorMessage } from '@/lib/errors'
import { THUMBNAIL_SIZE } from '@/lib/images'

type State =
  | { step: 'idle' }
  | { step: 'checking' }
  | { step: 'checked'; total: number; missing: string[] }
  | { step: 'running'; done: number; failed: number; count: number }
  | { step: 'finished'; done: number; failed: number }
  | { step: 'error'; message: string }

/**
 * 一覧用の小さい画像を、まだないもの（この仕組みを入れる前にアップロードした画像）のぶん作る。
 * 元の画像をブラウザで読み込んで縮め、1 枚ずつ送る。作るまでは一覧に元の画像が出る
 */
export function ThumbnailBackfill() {
  const list = useServerFn(listImagesWithoutThumbnail)
  const makeThumbnail = useThumbnailMaker()
  const [state, setState] = useState<State>({ step: 'idle' })

  const check = async () => {
    setState({ step: 'checking' })
    try {
      const { total, missing } = await list()
      setState({ step: 'checked', total, missing })
    } catch (e) {
      setState({
        step: 'error',
        message: errorMessage(e, '確かめられませんでした'),
      })
    }
  }

  const run = async (keys: readonly string[]) => {
    let done = 0
    let failed = 0
    setState({ step: 'running', done, failed, count: keys.length })
    for (const key of keys) {
      try {
        await makeThumbnail(key)
        done++
      } catch {
        failed++
      }
      setState({ step: 'running', done, failed, count: keys.length })
    }
    setState({ step: 'finished', done, failed })
  }

  return (
    <section className="rounded-lg border p-4">
      <h2 className="font-semibold">一覧用の小さい画像</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        公開側の一覧には、写真や表紙を小さくした画像（長い辺 {THUMBNAIL_SIZE}
        px）を出します。新しくアップロードした画像は自動で作ります。
        それより前の画像は、ここでまとめて作れます（作るまでは元の大きな画像が出ます）。
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
        {state.step === 'idle' || state.step === 'error' ? (
          <>
            <Button variant="outline" size="sm" onClick={check}>
              足りないものを確かめる
            </Button>
            {state.step === 'error' && (
              <span className="text-destructive">{state.message}</span>
            )}
          </>
        ) : state.step === 'checking' ? (
          <span className="inline-flex items-center gap-2 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            確かめています…
          </span>
        ) : state.step === 'checked' ? (
          state.missing.length === 0 ? (
            <span className="text-muted-foreground">
              {state.total} 枚とも作ってあります。
            </span>
          ) : (
            <>
              <span>
                {state.total} 枚のうち {state.missing.length} 枚がまだです。
              </span>
              <Button size="sm" onClick={() => run(state.missing)}>
                {state.missing.length} 枚ぶん作る
              </Button>
            </>
          )
        ) : state.step === 'running' ? (
          <span className="inline-flex items-center gap-2 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            作っています… {state.done + state.failed} / {state.count}
            {state.failed > 0 && `（失敗 ${state.failed}）`}
          </span>
        ) : (
          <>
            <span>
              {state.done} 枚作りました。
              {state.failed > 0 &&
                ` ${state.failed} 枚は作れませんでした（元の画像のまま出ます）。`}
            </span>
            <Button variant="outline" size="sm" onClick={check}>
              もう一度確かめる
            </Button>
          </>
        )}
      </div>
    </section>
  )
}
