import { createFileRoute } from '@tanstack/react-router'

import {
  clientOnlyTool,
  ToolPage,
  toolRouteOptions,
} from '@/components/playground/tool-page'

// ツール本体（kuromoji の辞書を使う）はブラウザでだけ読み込む
const Furigana = clientOnlyTool(
  import.meta.env.SSR
    ? null
    : () =>
        import('@/components/playground/tools/furigana/furigana').then((m) => ({
          default: m.Furigana,
        })),
)

export const Route = createFileRoute('/playground/furigana')({
  ...toolRouteOptions('furigana'),
  component: Page,
})

function Page() {
  return (
    <ToolPage slug="furigana" clientOnly>
      <Furigana />
    </ToolPage>
  )
}
