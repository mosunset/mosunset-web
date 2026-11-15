import { createId } from '@paralleldrive/cuid2'
import { RefreshCw } from 'lucide-react'
import { nanoid } from 'nanoid'
import { useCallback, useEffect, useState } from 'react'
import { decodeTime, ulid } from 'ulid'
import { v7 as uuidv7 } from 'uuid'

import { CopyButton } from '@/components/playground/parts'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

type Kind = {
  id: string
  name: string
  generate: () => string
  /** ID に入っている作成時刻（ないものは undefined） */
  timeOf?: (id: string) => Date
  summary: string
  sortable: boolean
}

const kinds: Kind[] = [
  {
    id: 'uuidv4',
    name: 'UUID v4',
    generate: () => crypto.randomUUID(),
    summary: '128 ビット中 122 ビットがランダム。いちばん広く使われている形式',
    sortable: false,
  },
  {
    id: 'uuidv7',
    name: 'UUID v7',
    generate: () => uuidv7(),
    timeOf: (id) =>
      new Date(Number.parseInt(id.replace(/-/g, '').slice(0, 12), 16)),
    summary: '先頭 48 ビットがミリ秒の時刻。作った順に並ぶので DB の主キー向き',
    sortable: true,
  },
  {
    id: 'ulid',
    name: 'ULID',
    generate: () => ulid(),
    timeOf: (id) => new Date(decodeTime(id)),
    summary:
      '時刻＋ランダムを Crockford Base32 の 26 文字で。大文字小文字を区別しない',
    sortable: true,
  },
  {
    id: 'cuid2',
    name: 'Cuid2',
    generate: () => createId(),
    summary:
      'ハッシュを使ってランダムにした ID。並び順や作成時刻から推測されにくい',
    sortable: false,
  },
  {
    id: 'nanoid',
    name: 'NanoID',
    generate: () => nanoid(),
    summary:
      'URL に使える 64 種類の文字で 21 文字。短くて UUID v4 と同程度の衝突しにくさ',
    sortable: false,
  },
]

export function IdGenerators() {
  const [count, setCount] = useState(1)
  const [ids, setIds] = useState<Record<string, string[]>>({})

  const regenerate = useCallback(() => {
    setIds(
      Object.fromEntries(
        kinds.map((k) => [
          k.id,
          Array.from({ length: count }, () => k.generate()),
        ]),
      ),
    )
  }, [count])

  useEffect(() => regenerate(), [regenerate])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-2">
          <Label htmlFor="id-count">生成する数</Label>
          <select
            id="id-count"
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            className="h-10 rounded-lg border bg-transparent px-2.5 text-base md:h-8 md:text-sm"
          >
            {[1, 5, 10, 50, 100].map((n) => (
              <option key={n} value={n}>
                {n} 個
              </option>
            ))}
          </select>
        </div>
        <Button type="button" onClick={regenerate}>
          <RefreshCw />
          すべて作り直す
        </Button>
      </div>

      <div className="space-y-4">
        {kinds.map((k) => {
          const list = ids[k.id] ?? []
          const first = list[0]
          return (
            <section key={k.id} className="rounded-lg border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-semibold">
                  {k.name}
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    {first?.length ?? 0} 文字・
                    {k.sortable ? '時刻順に並ぶ' : '並び順は意味なし'}
                  </span>
                </h2>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setIds((prev) => ({
                        ...prev,
                        [k.id]: Array.from({ length: count }, () =>
                          k.generate(),
                        ),
                      }))
                    }
                  >
                    <RefreshCw />
                    作り直す
                  </Button>
                  <CopyButton
                    value={list.join('\n')}
                    label={count > 1 ? 'すべてコピー' : 'コピー'}
                  />
                </div>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{k.summary}</p>
              <pre className="mt-3 max-h-60 overflow-auto rounded-md bg-muted/50 p-3 font-mono text-sm">
                {list.join('\n')}
              </pre>
              {k.timeOf && first && (
                <p className="mt-2 text-xs text-muted-foreground">
                  先頭の ID の作成時刻:{' '}
                  {k.timeOf(first).toLocaleString('ja-JP')}
                </p>
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}
