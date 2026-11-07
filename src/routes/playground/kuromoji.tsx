import { createFileRoute } from '@tanstack/react-router'

import {
  clientOnlyTool,
  ToolPage,
  toolRouteOptions,
} from '@/components/playground/tool-page'

// ツール本体はブラウザでだけ読み込む（サーバー用のビルドには入れない）
const Kuromoji = clientOnlyTool(
  import.meta.env.SSR
    ? null
    : () =>
        import('@/components/playground/tools/kuromoji').then((m) => ({
          default: m.Kuromoji,
        })),
)

export const Route = createFileRoute('/playground/kuromoji')({
  ...toolRouteOptions('kuromoji'),
  component: Page,
})

function Page() {
  return (
    <ToolPage slug="kuromoji" clientOnly wide>
      <Kuromoji />
    </ToolPage>
  )
}
