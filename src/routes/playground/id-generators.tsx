import { createFileRoute } from '@tanstack/react-router'

import {
  clientOnlyTool,
  ToolPage,
  toolRouteOptions,
} from '@/components/playground/tool-page'

// ツール本体はブラウザでだけ読み込む（サーバー用のビルドには入れない）
const IdGenerators = clientOnlyTool(
  import.meta.env.SSR
    ? null
    : () =>
        import('@/components/playground/tools/id-generators').then((m) => ({
          default: m.IdGenerators,
        })),
)

export const Route = createFileRoute('/playground/id-generators')({
  ...toolRouteOptions('id-generators'),
  component: Page,
})

function Page() {
  return (
    <ToolPage slug="id-generators" clientOnly>
      <IdGenerators />
    </ToolPage>
  )
}
