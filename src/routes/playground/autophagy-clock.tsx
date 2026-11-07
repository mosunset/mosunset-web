import { createFileRoute } from '@tanstack/react-router'

import {
  clientOnlyTool,
  ToolPage,
  toolRouteOptions,
} from '@/components/playground/tool-page'

// ツール本体はブラウザでだけ読み込む（サーバー用のビルドには入れない）
const AutophagyClock = clientOnlyTool(
  import.meta.env.SSR
    ? null
    : () =>
        import('@/components/playground/tools/autophagy-clock').then((m) => ({
          default: m.AutophagyClock,
        })),
)

export const Route = createFileRoute('/playground/autophagy-clock')({
  ...toolRouteOptions('autophagy-clock'),
  component: Page,
})

function Page() {
  return (
    <ToolPage slug="autophagy-clock" clientOnly>
      <AutophagyClock />
    </ToolPage>
  )
}
